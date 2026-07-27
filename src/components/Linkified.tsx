import { useMemo } from 'react'

const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<>"')\]]+)/gi

/** Renders plain text with any URLs in it turned into clickable links. */
export function Linkified({ text }: { text: string }) {
  const parts = useMemo(() => text.split(URL_REGEX), [text])
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null
        if (i % 2 === 1) {
          const href = part.startsWith('www.') ? `https://${part}` : part
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00bfff] underline break-all hover:text-[#8a2be2]"
            >
              {part}
            </a>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
