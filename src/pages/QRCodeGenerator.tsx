import { useState, useEffect, useRef } from 'react'

declare global {
  interface Window {
    QRCode: any
  }
}

export function QRCodeGenerator() {
  const [text, setText] = useState('')
  const [size, setSize] = useState(200)
  const [error, setError] = useState('')
  const qrcodeRef = useRef<HTMLDivElement>(null)
  const qrcodeInstance = useRef<any>(null)

  useEffect(() => {
    const script = document.createElement('script')
    script.src = '/qrcode.min.js'
    script.async = true
    document.body.appendChild(script)
    return () => {
      document.body.removeChild(script)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      generateQRCode()
    }, 300)
    return () => clearTimeout(timer)
  }, [text, size])

  const generateQRCode = () => {
    if (!qrcodeRef.current || !window.QRCode) return

    qrcodeRef.current.innerHTML = ''
    setError('')

    if (text.trim() === '') return

    qrcodeInstance.current = new window.QRCode(qrcodeRef.current, {
      text: text,
      width: size,
      height: size,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: window.QRCode.CorrectLevel.H
    })
  }

  const downloadQRCode = () => {
    const canvas = qrcodeRef.current?.querySelector('canvas')
    if (!canvas) {
      setError('Generate a QR code first')
      return
    }

    const link = document.createElement('a')
    link.download = 'qrcode.png'
    link.href = canvas.toDataURL('image/png')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="min-h-screen bg-[#121212] text-[#e0e0e0] flex justify-center items-center p-4">
      <div className="bg-[#1e1e1e] rounded-lg p-8 shadow-lg w-full max-w-[500px]">
        <h1 className="text-center text-[#bb86fc] text-2xl font-bold mb-6">QR Code Generator</h1>

        <div className="mb-6">
          <label htmlFor="text-input" className="block mb-2 text-[#bb86fc]">
            Enter text or URL:
          </label>
          <input
            type="text"
            id="text-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="https://example.com"
            className="w-full p-3 border border-[#333] rounded bg-[#2d2d2d] text-[#e0e0e0]"
            autoFocus
          />
          <div className="text-[0.6rem] text-[#757575] mt-1 p-3">
            QR code will generate automatically as you type
          </div>
          {error && <div className="text-[#cf6679] mt-2">{error}</div>}
        </div>

        <div className="mb-6">
          <label htmlFor="size-select" className="block mb-2 text-[#bb86fc]">
            QR Code Size:
          </label>
          <select
            id="size-select"
            value={size}
            onChange={(e) => setSize(parseInt(e.target.value))}
            className="w-full p-3 border border-[#333] rounded bg-[#2d2d2d] text-[#e0e0e0]"
          >
            <option value="128">Small (128×128)</option>
            <option value="200">Medium (200×200)</option>
            <option value="256">Large (256×256)</option>
            <option value="320">Extra Large (320×320)</option>
          </select>
        </div>

        <div className="flex justify-center my-8">
          <div ref={qrcodeRef} className="p-4 bg-white rounded" />
        </div>

        <button
          onClick={downloadQRCode}
          className="w-full bg-[#bb86fc] text-white border-none rounded p-3 text-base cursor-pointer hover:bg-[#9a67ea] transition-colors font-semibold"
        >
          Download QR Code
        </button>

        <div className="text-center mt-8 text-xs text-[#757575]">
          Powered by utilitykit
        </div>
      </div>
    </div>
  )
}
