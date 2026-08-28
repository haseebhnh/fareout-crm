import { supabaseAdmin } from './admin-client'

// ============================================================
// Shared CV-intake path for every automated channel (WhatsApp
// documents today, inbound email next). Both funnel through here so
// there is exactly one place that decides how an incoming resume
// becomes a candidate — not one code path per channel.
//
// Reuses the EXISTING recruitment schema end to end:
//   - `candidate-cvs` storage bucket (055) — same bucket the manual
//     upload flow in /hr/recruitment writes to.
//   - `candidates` / `candidate_applications` (049/055) — same
//     find-or-create-by-contact-info logic the manual "apply to job"
//     flow uses, so a person who WhatsApps a CV and later emails one
//     too still resolves to one candidate row, not two.
// ============================================================

export const RESUME_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export interface CvIntakeInput {
  accountId: string
  source: 'whatsapp' | 'email'
  fullName: string
  email?: string | null
  phone?: string | null
  fileBuffer: Buffer
  fileName: string
  mimeType: string
  defaultJobOpeningId?: string | null
}

export interface CvIntakeResult {
  candidateId: string
  created: boolean
}

function buildCvPath(accountId: string, source: string, fileName: string): string {
  const hasExt = /\.[^.]+$/.test(fileName)
  const ext = hasExt ? fileName.split('.').pop()!.toLowerCase() : 'pdf'
  const safeBase =
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40) || 'cv'
  return `account-${accountId}/${source}-${Date.now()}-${safeBase}.${ext}`
}

/**
 * Uploads the file, finds-or-creates the candidate (by phone, then
 * email), and — when a default job opening is configured — attaches
 * a `candidate_applications` row so it shows up in the pipeline the
 * same way a manual application does.
 *
 * Never throws — every failure is logged and returns null, so a
 * webhook caller can `.catch` once and still 200 back to the sender.
 */
export async function ingestCv(input: CvIntakeInput): Promise<CvIntakeResult | null> {
  const { accountId, source, fullName, email, phone, fileBuffer, fileName, mimeType, defaultJobOpeningId } = input
  const db = supabaseAdmin()

  try {
    const path = buildCvPath(accountId, source, fileName)
    const { error: uploadError } = await db.storage.from('candidate-cvs').upload(path, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    })
    if (uploadError) {
      console.error('[cv-intake] upload failed:', uploadError)
      return null
    }

    let query = db
      .from('candidates')
      .select('id, resume_storage_path')
      .eq('account_id', accountId)
    if (phone && email) query = query.or(`phone.eq.${phone},email.eq.${email}`)
    else if (phone) query = query.eq('phone', phone)
    else if (email) query = query.eq('email', email)
    else {
      console.warn('[cv-intake] no phone or email to match/create a candidate on')
      return null
    }
    const { data: existing } = await query.limit(1).maybeSingle()

    let candidateId: string
    let created = false

    if (existing) {
      candidateId = existing.id as string
      // Fill the gap rather than overwrite — HR may have already
      // reviewed and annotated the existing CV.
      if (!existing.resume_storage_path) {
        await db.from('candidates').update({ resume_storage_path: path }).eq('id', candidateId)
      }
    } else {
      const { data: inserted, error: insertError } = await db
        .from('candidates')
        .insert({
          account_id: accountId,
          full_name: fullName || phone || email || 'Unknown candidate',
          email: email || null,
          phone: phone || null,
          source,
          resume_storage_path: path,
        })
        .select('id')
        .single()
      if (insertError || !inserted) {
        console.error('[cv-intake] candidate insert failed:', insertError)
        return null
      }
      candidateId = inserted.id as string
      created = true
    }

    if (defaultJobOpeningId) {
      const { data: existingApp } = await db
        .from('candidate_applications')
        .select('id')
        .eq('candidate_id', candidateId)
        .eq('job_opening_id', defaultJobOpeningId)
        .maybeSingle()
      if (!existingApp) {
        const { error: appError } = await db.from('candidate_applications').insert({
          account_id: accountId,
          candidate_id: candidateId,
          job_opening_id: defaultJobOpeningId,
          source,
        })
        if (appError) console.error('[cv-intake] application insert failed:', appError)
      }
    }

    return { candidateId, created }
  } catch (err) {
    console.error('[cv-intake] unexpected error:', err)
    return null
  }
}
