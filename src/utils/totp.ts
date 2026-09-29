// RFC 6238 TOTP, computed locally with WebCrypto.

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

export interface TotpParams {
  secret: string // base32
  digits: number
  period: number
  algorithm: TotpAlgorithm
}

export interface ParsedOtpAuth extends TotpParams {
  issuer: string
  account: string
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// Uppercase, drop spaces/dashes/padding — authenticator setup pages print secrets in groups.
export const normalizeSecret = (secret: string) => secret.toUpperCase().replace(/[\s\-=]/g, '')

export const isValidSecret = (secret: string) => {
  const s = normalizeSecret(secret)
  return s.length >= 8 && /^[A-Z2-7]+$/.test(s)
}

const base32Decode = (secret: string): Uint8Array<ArrayBuffer> => {
  const s = normalizeSecret(secret)
  const out = new Uint8Array(Math.floor((s.length * 5) / 8))
  let bits = 0, value = 0, i = 0
  for (const ch of s) {
    const v = BASE32.indexOf(ch)
    if (v < 0) throw new Error('Invalid base32 secret')
    value = (value << 5) | v
    bits += 5
    if (bits >= 8) {
      out[i++] = (value >>> (bits - 8)) & 0xff
      bits -= 8
    }
  }
  return out
}

const HASH: Record<TotpAlgorithm, string> = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }

// Imported keys are reused across the per-second refresh
const keyCache = new Map<string, Promise<CryptoKey>>()

const hmacKey = (secret: string, algorithm: TotpAlgorithm) => {
  const cacheKey = `${algorithm}:${normalizeSecret(secret)}`
  let key = keyCache.get(cacheKey)
  if (!key) {
    key = crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: HASH[algorithm] }, false, ['sign'])
    keyCache.set(cacheKey, key)
  }
  return key
}

export const generateTotp = async ({ secret, digits, period, algorithm }: TotpParams, nowMilli = Date.now()): Promise<string> => {
  const counter = Math.floor(nowMilli / 1000 / period)
  const msg = new ArrayBuffer(8)
  const view = new DataView(msg)
  view.setUint32(0, Math.floor(counter / 0x100000000))
  view.setUint32(4, counter >>> 0)
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret, algorithm), msg))
  const o = sig[sig.length - 1] & 0x0f
  const bin = ((sig[o] & 0x7f) << 24) | (sig[o + 1] << 16) | (sig[o + 2] << 8) | sig[o + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}

// otpauth://totp/Issuer:account?secret=XXX&issuer=Issuer&digits=6&period=30&algorithm=SHA1
export const parseOtpAuthUri = (uri: string): ParsedOtpAuth => {
  const url = new URL(uri.trim())
  if (url.protocol !== 'otpauth:') throw new Error('Not an otpauth:// link')
  const type = (url.host || url.pathname.replace(/^\/\//, '').split('/')[0]).toLowerCase()
  if (type !== 'totp') throw new Error(`Only TOTP is supported (got ${type || 'unknown'})`)
  const p = url.searchParams
  const secret = p.get('secret') ?? ''
  if (!isValidSecret(secret)) throw new Error('Link has no valid secret')

  const label = decodeURIComponent(url.pathname.split('/').pop() ?? '')
  const [labelIssuer, labelAccount] = label.includes(':') ? label.split(/:(.*)/s) : ['', label]
  const algorithm = (p.get('algorithm') ?? 'SHA1').toUpperCase()
  const digits = Number(p.get('digits') ?? 6)
  const period = Number(p.get('period') ?? 30)
  return {
    secret: normalizeSecret(secret),
    issuer: (p.get('issuer') ?? labelIssuer).trim(),
    account: (labelAccount ?? '').trim(),
    digits: digits === 8 ? 8 : 6,
    period: period > 0 && period <= 300 ? period : 30,
    algorithm: algorithm === 'SHA256' || algorithm === 'SHA512' ? algorithm : 'SHA1',
  }
}
