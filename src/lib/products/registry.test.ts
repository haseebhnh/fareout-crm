import { describe, expect, it } from 'vitest'
import { PRODUCTS, getProduct, productForHost, isProductId } from './registry'

describe('PRODUCTS', () => {
  it('has exactly the available products with a real, complete implementation: crm, hr', () => {
    const available = PRODUCTS.filter((p) => p.status === 'available')
    expect(available.map((p) => p.id)).toEqual(['crm', 'hr'])
  })

  it('every available product has an in-app path to land on', () => {
    for (const p of PRODUCTS.filter((p) => p.status === 'available')) {
      expect(p.path, `${p.id} is available but has no path`).toBeTruthy()
    }
  })

  it('every product id is unique', () => {
    const ids = PRODUCTS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every subdomain is unique and ends in ootrix.com', () => {
    const hosts = PRODUCTS.map((p) => p.subdomain)
    expect(new Set(hosts).size).toBe(hosts.length)
    for (const host of hosts) expect(host).toMatch(/\.ootrix\.com$/)
  })
})

describe('getProduct', () => {
  it('returns the definition for a known id', () => {
    expect(getProduct('crm').subdomain).toBe('crm.ootrix.com')
  })
})

describe('productForHost', () => {
  it('resolves a known subdomain', () => {
    expect(productForHost('crm.ootrix.com')?.id).toBe('crm')
  })

  it('strips a port before lookup (local dev)', () => {
    // Not actually a registered product host, but proves the port is
    // stripped rather than causing a false negative on a real one.
    expect(productForHost('crm.ootrix.com:3000')?.id).toBe('crm')
  })

  it('returns null for app.ootrix.com and the bare domain', () => {
    expect(productForHost('app.ootrix.com')).toBeNull()
    expect(productForHost('ootrix.com')).toBeNull()
  })

  it('returns null for an unregistered host', () => {
    expect(productForHost('evil.example.com')).toBeNull()
  })
})

describe('isProductId', () => {
  it('accepts every registered id', () => {
    for (const p of PRODUCTS) expect(isProductId(p.id)).toBe(true)
  })

  it('rejects an arbitrary string', () => {
    expect(isProductId('not-a-product')).toBe(false)
  })
})
