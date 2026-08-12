import { describe, expect, it, vi } from 'vitest'
import { hasProductAccess, requireProductAccess } from './access'
import { ForbiddenError } from '@/lib/auth/account'

function supabaseWith(enabledProducts: string[] | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: enabledProducts === null ? null : { enabled_products: enabledProducts },
            error: null,
          })),
        })),
      })),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('hasProductAccess', () => {
  it('true when the product id is in enabled_products', async () => {
    const supabase = supabaseWith(['crm'])
    await expect(hasProductAccess(supabase, 'acct-1', 'crm')).resolves.toBe(true)
  })

  it('false when the product id is absent', async () => {
    const supabase = supabaseWith(['crm'])
    await expect(hasProductAccess(supabase, 'acct-1', 'hr')).resolves.toBe(false)
  })

  it('false (not throw) when the account row is missing', async () => {
    const supabase = supabaseWith(null)
    await expect(hasProductAccess(supabase, 'acct-1', 'crm')).resolves.toBe(false)
  })
})

describe('requireProductAccess', () => {
  it('resolves when access is granted', async () => {
    const supabase = supabaseWith(['crm'])
    await expect(requireProductAccess(supabase, 'acct-1', 'crm')).resolves.toBeUndefined()
  })

  it('throws ForbiddenError when access is not granted', async () => {
    const supabase = supabaseWith(['crm'])
    await expect(requireProductAccess(supabase, 'acct-1', 'hr')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })
})
