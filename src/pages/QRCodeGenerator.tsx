import { useState, useEffect, useRef } from 'react'
import { useSEO } from '../utils/useSEO'
import { readQrCodes } from '../utils/readQr'

declare global {
  interface Window {
    QRCode: any
  }
}

export function QRCodeGenerator() {
  useSEO({
    title: 'QR Code Generator',
    description: 'Free online QR code generator. Create QR codes for URLs, text, WiFi, and more. Download in various sizes instantly.',
    keywords: 'qr code, qr generator, barcode, scan code, url to qr, free qr code',
  });

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

  const [tab, setTab] = useState<'generate' | 'read'>('generate')

  // Reader: decode a QR code from an uploaded / pasted / dropped image or the camera
  const [decoded, setDecoded] = useState<string[] | null>(null)
  const [readError, setReadError] = useState('')
  const [copied, setCopied] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const showResults = (found: string[]) => {
    setDecoded(found)
    setReadError(found.length ? '' : 'No QR code found in that image')
  }

  const readImage = async (file: File | undefined) => {
    if (!file?.type.startsWith('image/')) return
    setDecoded(null)
    try {
      showResults(await readQrCodes(file))
    } catch (e) {
      setReadError((e as Error).message)
    }
  }

  // Cmd/Ctrl+V a screenshot anywhere on the page to read it
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const image = Array.from(e.clipboardData?.files ?? []).find(f => f.type.startsWith('image/'))
      if (!image) return
      e.preventDefault()
      setTab('read')
      readImage(image)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll camera frames until a code is found or scanning is stopped
  useEffect(() => {
    if (!scanning) return
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setTimeout>
    let stopped = false
    const scan = async () => {
      const video = videoRef.current
      if (stopped || !video) return
      const found = video.readyState >= 2 ? await readQrCodes(video).catch(() => []) : []
      if (stopped) return
      if (found.length) {
        showResults(found)
        setScanning(false)
      } else {
        timer = setTimeout(scan, 250)
      }
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => {
        stream = s
        if (stopped) return s.getTracks().forEach(t => t.stop())
        videoRef.current!.srcObject = s
        videoRef.current!.play()
        scan()
      })
      .catch(e => {
        setReadError(`Camera unavailable: ${(e as Error).message}`)
        setScanning(false)
      })
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [scanning])

  const startCamera = () => {
    setDecoded(null)
    setReadError('')
    setScanning(true)
  }

  const copyDecoded = async (value: string, i: number) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(i)
      setTimeout(() => setCopied(c => (c === i ? null : c)), 1500)
    } catch {
      /* clipboard unavailable */
    }
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
        <div className="flex mb-6 p-1 rounded bg-[#2d2d2d]">
          {(['generate', 'read'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); if (t === 'generate') setScanning(false) }}
              className={`flex-1 p-2 rounded text-sm font-semibold cursor-pointer transition-colors ${tab === t ? 'bg-[#bb86fc]! text-white' : 'bg-transparent! text-[#757575] hover:text-[#e0e0e0]'}`}
            >
              {t === 'generate' ? 'Generator' : 'Reader'}
            </button>
          ))}
        </div>

        <h1 className="text-center text-[#bb86fc] text-2xl font-bold mb-6">{tab === 'generate' ? 'QR Code Generator' : 'QR Code Reader'}</h1>

        {/* Kept mounted while hidden so the rendered QR survives tab switches */}
        <div className={tab === 'generate' ? '' : 'hidden'}>
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
        </div>

        {tab === 'read' && (<>
        <label
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); readImage(e.dataTransfer.files[0]) }}
          className={`block text-center p-6 rounded border-2 border-dashed cursor-pointer transition-colors ${dragging ? 'border-[#bb86fc] bg-[#2d2d2d]' : 'border-[#444] hover:border-[#bb86fc]'}`}
        >
          <div>📷 Choose or drop an image</div>
          <div className="text-xs text-[#757575] mt-1">or paste a screenshot (Ctrl/⌘+V)</div>
          <input type="file" accept="image/*" className="hidden" onChange={e => { readImage(e.target.files?.[0]); e.target.value = '' }} />
        </label>

        {'mediaDevices' in navigator && (
          <button
            onClick={() => (scanning ? setScanning(false) : startCamera())}
            className="w-full mt-3 bg-[#2d2d2d] text-[#e0e0e0] border border-[#333] rounded p-3 text-base cursor-pointer hover:border-[#bb86fc] transition-colors"
          >
            {scanning ? 'Stop camera' : 'Scan with camera'}
          </button>
        )}
        {scanning && <video ref={videoRef} muted playsInline className="w-full mt-3 rounded bg-black" />}

        {readError && <div className="text-[#cf6679] mt-3">{readError}</div>}
        {decoded?.map((value, i) => {
          const isUrl = /^https?:\/\//i.test(value)
          return (
            <div key={i} className="mt-3 p-3 rounded border border-[#333] bg-[#2d2d2d]">
              <div className="font-mono text-sm break-all whitespace-pre-wrap">{value}</div>
              <div className="flex gap-4 mt-2 text-sm">
                <button onClick={() => copyDecoded(value, i)} className="text-[#bb86fc] font-semibold cursor-pointer">
                  {copied === i ? 'Copied' : 'Copy'}
                </button>
                {isUrl && (
                  <a href={value} target="_blank" rel="noopener noreferrer" className="text-[#bb86fc] font-semibold">Open link ↗</a>
                )}
                <button onClick={() => { setText(value); setTab('generate') }} className="text-[#757575] hover:text-[#e0e0e0] cursor-pointer">Use in generator</button>
              </div>
            </div>
          )
        })}
        </>)}

        <div className="text-center mt-8 text-xs text-[#757575]">
          Powered by utilitykit
        </div>
      </div>
    </div>
  )
}
