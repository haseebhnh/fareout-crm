import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/hr/admin-client'
import { ingestCv, RESUME_MIME_TYPES } from '@/lib/hr/cv-intake'

// ============================================================
// Generic inbound-email webhook for HR's email CV intake.
//
// Deliberately provider-agnostic: this doesn't speak IMAP or
// Microsoft Graph directly (registering an Azure app / getting a
// tenant admin's OAuth consent is an action only that admin can take
// — it can't be fabricated here). Instead this accepts one plain
// JSON contract that ANY mail-forwarding source can be configured to
// call, including a Microsoft 365 Power Automate flow ("When a new
// email arrives" → HTTP POST) or a mail rule through a forwarding
// service — see the setup instructions surfaced in /hr/settings.
//
// Auth: a per-account bearer token (hr_settings.email_intake_token,
// 059) passed as `?token=`, generated from the Settings page. Anyone
// with the token can post CVs into that account's pipeline, which is
// the same trust model a webhook URL always has — treat it like a
// secret, regenerate if it leaks.
// ============================================================

interface InboundEmailPayload {
  from?: string
  subject?: string
  attachments?: { filename: string; mimeType: string; contentBase64: string }[]
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 })
  }

  const db = supabaseAdmin()
  const { data: settings } = await db
    .from('hr_settings')
    .select('account_id, email_cv_intake_enabled, email_cv_default_job_opening_id')
    .eq('email_intake_token', token)
    .maybeSingle()

  if (!settings || !settings.email_cv_intake_enabled) {
    // Same response whether the token is wrong or intake is disabled —
    // don't leak which one it was.
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: InboundEmailPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const fromEmail = (body.from || '').trim().toLowerCase()
  const attachments = body.attachments ?? []
  const resumeAttachments = attachments.filter(
    (a) => a?.mimeType && RESUME_MIME_TYPES.has(a.mimeType) && a.contentBase64,
  )

  if (!fromEmail || resumeAttachments.length === 0) {
    // Not an error — plenty of inbound mail has no resume attached.
    return NextResponse.json({ ok: true, ingested: 0 })
  }

  const fallbackName = fromEmail
    .split('@')[0]
    .replace(/[._]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

  let ingested = 0
  for (const attachment of resumeAttachments) {
    let buffer: Buffer
    try {
      buffer = Buffer.from(attachment.contentBase64, 'base64')
    } catch {
      continue
    }
    const result = await ingestCv({
      accountId: settings.account_id as string,
      source: 'email',
      fullName: fallbackName,
      email: fromEmail,
      fileBuffer: buffer,
      fileName: attachment.filename,
      mimeType: attachment.mimeType,
      defaultJobOpeningId: (settings.email_cv_default_job_opening_id as string | null) ?? null,
    })
    if (result) ingested += 1
  }

  return NextResponse.json({ ok: true, ingested })
}
