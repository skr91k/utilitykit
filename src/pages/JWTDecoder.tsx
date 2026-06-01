import { useState } from 'react'
import { useSEO } from '../utils/useSEO'

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')
  return decodeURIComponent(
    atob(padded)
      .split('')
      .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  )
}

function parseJWT(token: string) {
  const parts = token.trim().split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT: must have 3 parts')
  const header = JSON.parse(base64UrlDecode(parts[0]))
  const payload = JSON.parse(base64UrlDecode(parts[1]))
  return { header, payload, signature: parts[2] }
}

function formatValue(key: string, value: unknown): { display: string; extra?: string } {
  if ((key === 'exp' || key === 'iat' || key === 'nbf') && typeof value === 'number') {
    const date = new Date(value * 1000)
    return { display: String(value), extra: date.toLocaleString() }
  }
  if (typeof value === 'object') return { display: JSON.stringify(value, null, 2) }
  return { display: String(value) }
}

function isExpired(payload: Record<string, unknown>): boolean | null {
  if (typeof payload.exp !== 'number') return null
  return Date.now() / 1000 > payload.exp
}

const CLAIM_LABELS: Record<string, string> = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expires At',
  nbf: 'Not Before',
  iat: 'Issued At',
  jti: 'JWT ID',
  name: 'Name',
  email: 'Email',
  roles: 'Roles',
  scope: 'Scope',
}

function Section({ title, color, data }: { title: string; color: string; data: Record<string, unknown> }) {
  return (
    <div className="mb-4 rounded-lg overflow-hidden border border-[#333]">
      <div className={`px-4 py-2 font-bold text-sm ${color}`}>{title}</div>
      <div className="bg-[#121212] p-4 space-y-2">
        {Object.entries(data).map(([k, v]) => {
          const { display, extra } = formatValue(k, v)
          const label = CLAIM_LABELS[k] ?? k
          return (
            <div key={k} className="flex flex-col sm:flex-row sm:gap-4 text-sm">
              <span className="text-[#888] w-32 shrink-0 font-mono">{label}</span>
              <span className="text-gray-200 font-mono break-all">{display}
                {extra && <span className="ml-2 text-[#00bfff] text-xs">({extra})</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function JWTDecoder() {
  useSEO({
    title: 'JWT Token Decoder',
    description: 'Decode and inspect JWT tokens — view header, payload claims, expiry status and signature.',
    keywords: 'jwt, json web token, decode, inspect, claims, header, payload',
  })

  const [input, setInput] = useState('')
  const [result, setResult] = useState<{ header: Record<string, unknown>; payload: Record<string, unknown>; signature: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const decode = () => {
    setError(null)
    setResult(null)
    if (!input.trim()) { setError('Paste a JWT token above'); return }
    try {
      const token = input.trim().replace(/^bearer\s+/i, '')
      setResult(parseJWT(token))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const expired = result ? isExpired(result.payload) : null

  return (
    <div className="min-h-screen bg-[#121212] text-[#f0f0f0] flex flex-col items-center p-4 pt-8">
      <div className="w-full max-w-[800px]">
        <h1 className="text-center text-[#00bfff] text-2xl font-bold mb-2">JWT Token Decoder</h1>
        <p className="text-center text-gray-500 text-sm mb-6">Paste any JWT to inspect its header, claims and expiry</p>

        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
          className="w-full p-3 rounded-md border border-[#333] bg-[#1e1e1e] text-[#f0f0f0] font-mono text-sm min-h-[100px] resize-y focus:outline-none focus:border-[#00bfff]"
        />

        <button
          onClick={decode}
          className="w-full mt-3 p-3 bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white rounded-md font-bold uppercase tracking-wide cursor-pointer hover:from-[#00bfff] hover:to-[#8a2be2] transition-all"
        >
          Decode
        </button>

        {error && (
          <div className="mt-4 p-3 rounded-md bg-red-900/50 border border-red-700 text-red-300 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6">
            {expired !== null && (
              <div className={`mb-4 p-3 rounded-md text-sm font-semibold text-center ${expired ? 'bg-red-900/50 border border-red-700 text-red-300' : 'bg-green-900/50 border border-green-700 text-green-300'}`}>
                {expired ? 'Token is EXPIRED' : 'Token is VALID (not expired)'}
              </div>
            )}

            <Section title="HEADER" color="bg-[#1e1e1e] text-[#ff1493]" data={result.header} />
            <Section title="PAYLOAD" color="bg-[#1e1e1e] text-[#00bfff]" data={result.payload} />

            <div className="mb-4 rounded-lg overflow-hidden border border-[#333]">
              <div className="px-4 py-2 font-bold text-sm bg-[#1e1e1e] text-[#f0a500]">SIGNATURE</div>
              <div className="bg-[#121212] p-4">
                <span className="font-mono text-xs text-gray-500 break-all">{result.signature}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
