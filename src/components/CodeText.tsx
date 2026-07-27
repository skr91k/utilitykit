import { useMemo } from 'react'
import { Linkified } from './Linkified'

/**
 * Language-agnostic paste rendering.
 *
 * Pastes hold a mix of notes, link lists and source code, and nobody wants to
 * pick a language from a dropdown first. So instead of detecting *which*
 * language a paste is, we only decide *whether* it looks like code at all:
 *
 *   - prose / links -> plain wrapped text with clickable URLs (unchanged)
 *   - code          -> line-number gutter + highlighting of the constructs
 *                      almost every language shares (comments, strings,
 *                      numbers, a common keyword set)
 *
 * That keeps false positives off ordinary notes, where a stray "if" or an
 * apostrophe would otherwise get coloured.
 */

const KEYWORDS = [
  'function', 'const', 'let', 'var', 'def', 'lambda', 'class', 'struct', 'enum',
  'interface', 'extends', 'implements', 'return', 'yield', 'import', 'export',
  'from', 'require', 'module', 'package', 'namespace', 'public', 'private',
  'protected', 'static', 'final', 'abstract', 'void', 'async', 'await',
  'if', 'elif', 'else', 'for', 'while', 'switch', 'case', 'default', 'break',
  'continue', 'try', 'catch', 'except', 'finally', 'throw', 'raise', 'new',
  'delete', 'this', 'self', 'super', 'null', 'nil', 'None', 'undefined',
  'true', 'false', 'True', 'False', 'int', 'float', 'bool', 'boolean', 'char',
  'echo', 'print', 'console', 'typeof', 'instanceof', 'in', 'is', 'not',
]

const URL_SOURCE = '(?:https?:\\/\\/|www\\.)[^\\s<>"\')\\]]+'

/**
 * URLs come first on purpose: without that, the "//" in https:// would be
 * eaten by the line-comment rule and every link would render as a comment.
 */
const TOKEN_RE = new RegExp(
  [
    `(?<url>${URL_SOURCE})`,
    '(?<blockFull>\\/\\*.*?\\*\\/)',
    '(?<blockOpen>\\/\\*.*$)',
    '(?<comment>\\/\\/.*$|^\\s*#.*$|^\\s*--.*$)',
    '(?<str>"(?:\\\\.|[^"\\\\])*"|`(?:\\\\.|[^`\\\\])*`|(?<![A-Za-z])\'(?:\\\\.|[^\'\\\\])*\')',
    `(?<num>\\b\\d+(?:\\.\\d+)?\\b)`,
    `(?<kw>\\b(?:${KEYWORDS.join('|')})\\b)`,
  ].join('|'),
  'g'
)

const TOKEN_CLASS: Record<string, string> = {
  url: 'text-[#00bfff] underline hover:text-[#8a2be2]',
  blockFull: 'text-[#6a9955] italic',
  blockOpen: 'text-[#6a9955] italic',
  comment: 'text-[#6a9955] italic',
  str: 'text-[#ce9178]',
  num: 'text-[#b5cea8]',
  kw: 'text-[#c586c0]',
}

/**
 * A paste counts as code when enough of its lines carry the punctuation and
 * indentation that source has and prose does not.
 */
function looksLikeCode(text: string): boolean {
  const lines = text.split('\n').slice(0, 200).filter(l => l.trim())
  if (lines.length < 2) return false
  const codey = lines.filter(l =>
    /[{}();=<>[\]]|^\s{2,}\S|^\s*(?:\/\/|#|--|import |from |def |function |class |const |let |var |public |private )/.test(l)
  ).length
  return codey / lines.length >= 0.3
}

interface Token {
  type: string
  value: string
}

/** Tokenises one line; `inBlock` carries an open block comment across lines. */
function tokenizeLine(line: string, inBlock: boolean): { tokens: Token[]; inBlock: boolean } {
  const tokens: Token[] = []
  let rest = line
  let stillInBlock = inBlock

  if (stillInBlock) {
    const end = rest.indexOf('*/')
    if (end === -1) {
      return { tokens: [{ type: 'comment', value: rest }], inBlock: true }
    }
    tokens.push({ type: 'comment', value: rest.slice(0, end + 2) })
    rest = rest.slice(end + 2)
    stillInBlock = false
  }

  let last = 0
  TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN_RE.exec(rest)) !== null) {
    if (match.index > last) {
      tokens.push({ type: 'plain', value: rest.slice(last, match.index) })
    }
    const groups = match.groups ?? {}
    const type = Object.keys(groups).find(k => groups[k] !== undefined) ?? 'plain'
    tokens.push({ type, value: match[0] })
    if (type === 'blockOpen') stillInBlock = true
    last = match.index + match[0].length
    if (match[0].length === 0) TOKEN_RE.lastIndex++
  }
  if (last < rest.length) {
    tokens.push({ type: 'plain', value: rest.slice(last) })
  }

  return { tokens, inBlock: stillInBlock }
}

function TokenSpan({ token }: { token: Token }) {
  if (token.type === 'url') {
    const href = token.value.startsWith('www.') ? `https://${token.value}` : token.value
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={TOKEN_CLASS.url}>
        {token.value}
      </a>
    )
  }
  const cls = TOKEN_CLASS[token.type]
  return cls ? <span className={cls}>{token.value}</span> : <>{token.value}</>
}

export function CodeText({ text }: { text: string }) {
  const isCode = useMemo(() => looksLikeCode(text), [text])

  const lines = useMemo(() => {
    if (!isCode) return []
    let inBlock = false
    return text.split('\n').map(line => {
      const result = tokenizeLine(line, inBlock)
      inBlock = result.inBlock
      return result.tokens
    })
  }, [text, isCode])

  // Notes and link lists keep the wrapped, gutter-free reading view.
  if (!isCode) {
    return (
      <pre className="font-mono text-sm text-gray-200 whitespace-pre-wrap break-words">
        <Linkified text={text} />
      </pre>
    )
  }

  const gutterWidth = `${String(lines.length).length + 1}ch`

  return (
    <div className="overflow-x-auto">
      <pre className="font-mono text-sm text-gray-200 leading-6 min-w-full w-max">
        {lines.map((tokens, i) => (
          <div key={i} className="flex">
            <span
              className="select-none shrink-0 sticky left-0 bg-[#121212] text-right pr-4 text-[#555]"
              style={{ minWidth: gutterWidth }}
            >
              {i + 1}
            </span>
            <span className="whitespace-pre">
              {tokens.map((token, j) => <TokenSpan key={j} token={token} />)}
            </span>
          </div>
        ))}
      </pre>
    </div>
  )
}
