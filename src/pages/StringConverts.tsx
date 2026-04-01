import { useState, useEffect, useRef } from 'react'

declare global {
  interface Window {
    md5: any
    sha1: any
    sha256: any
  }
}

const Section = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-5 border border-[#333] p-4 rounded bg-[#252525]">{children}</div>
)

const Output = ({ value }: { value: string }) => (
  <div className="mt-2 p-2 border border-dashed border-[#555] rounded bg-[#333] text-[#d4d4d4] whitespace-pre-wrap break-all">{value}</div>
)

const Btn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="px-3 py-2 cursor-pointer rounded border border-[#666] bg-[#444] text-[#d4d4d4] hover:bg-[#555] mr-2 mb-2">{children}</button>
)

export function StringConverts() {
  const [base64Input, setBase64Input] = useState('')
  const [base64Output, setBase64Output] = useState('')
  const [urlSafeInput, setUrlSafeInput] = useState('')
  const [urlSafeOutput, setUrlSafeOutput] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [urlFullOutput, setUrlFullOutput] = useState('')
  const [urlCompOutput, setUrlCompOutput] = useState('')
  const [urlParamOutput, setUrlParamOutput] = useState('')
  const [hashInput, setHashInput] = useState('')
  const [md5Output, setMd5Output] = useState('')
  const [sha1Output, setSha1Output] = useState('')
  const [sha256Output, setSha256Output] = useState('')
  const [fileResults, setFileResults] = useState<any[]>([])
  const [fileInfo, setFileInfo] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const scripts = [
      'https://cdnjs.cloudflare.com/ajax/libs/js-sha256/0.9.0/sha256.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/js-sha1/0.6.0/sha1.min.js',
      'https://cdn.jsdelivr.net/npm/blueimp-md5@2.19.0/js/md5.min.js'
    ]
    scripts.forEach(src => {
      const script = document.createElement('script')
      script.src = src
      script.async = true
      document.body.appendChild(script)
    })
  }, [])

  const textToBase64 = () => setBase64Output(btoa(unescape(encodeURIComponent(base64Input))))
  const base64ToText = () => {
    try { setBase64Output(decodeURIComponent(escape(atob(base64Input)))) }
    catch { setBase64Output('Invalid Base64 string') }
  }

  const textToUrlSafeBase64 = () => {
    const b64 = btoa(unescape(encodeURIComponent(urlSafeInput))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    setUrlSafeOutput(b64)
  }
  const urlSafeBase64ToText = () => {
    try {
      let b64 = urlSafeInput.replace(/-/g, '+').replace(/_/g, '/')
      while (b64.length % 4) b64 += '='
      setUrlSafeOutput(decodeURIComponent(escape(atob(b64))))
    } catch { setUrlSafeOutput('Invalid URL-safe Base64 string') }
  }

  const urlEncodeFull = () => setUrlFullOutput(encodeURI(urlInput))
  const urlDecodeFull = () => { try { setUrlFullOutput(decodeURI(urlInput)) } catch { setUrlFullOutput('Invalid URL') } }
  const urlEncodeComp = () => setUrlCompOutput(encodeURIComponent(urlInput))
  const urlDecodeComp = () => { try { setUrlCompOutput(decodeURIComponent(urlInput)) } catch { setUrlCompOutput('Invalid URL component') } }

  const urlEncodeParams = () => {
    const params: Record<string, string> = {}
    urlInput.split('&').forEach(pair => {
      const [key, value] = pair.split('=')
      if (key && value !== undefined) params[decodeURIComponent(key)] = decodeURIComponent(value)
    })
    setUrlParamOutput(Object.keys(params).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&'))
  }
  const urlDecodeParams = () => {
    const decoded: Record<string, string> = {}
    urlInput.split('&').forEach(pair => {
      const [key, value] = pair.split('=')
      if (key) decoded[decodeURIComponent(key)] = value !== undefined ? decodeURIComponent(value) : ''
    })
    setUrlParamOutput(Object.entries(decoded).map(([k, v]) => `${k}=${v}`).join('\n'))
  }

  const calcMD5 = () => setMd5Output(window.md5(hashInput))
  const calcSHA1 = () => setSha1Output(window.sha1(hashInput))
  const calcSHA256 = () => setSha256Output(window.sha256(hashInput))

  const handleFiles = (files: FileList) => {
    setFileInfo(`Processing ${files.length} file(s)...`)
    setFileResults([])
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const arr = new Uint8Array(e.target?.result as ArrayBuffer)
        setFileResults(prev => [...prev, {
          name: file.name,
          size: file.size,
          type: file.type || 'Unknown',
          md5: window.md5(arr),
          sha1: window.sha1(arr),
          sha256: window.sha256(arr)
        }])
      }
      reader.readAsArrayBuffer(file)
    })
    setFileInfo(`Processed ${files.length} file(s)`)
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#d4d4d4] p-5">
      <h1 className="text-2xl font-bold mb-5">
        <span className="text-[#f0c808]">Text</span>/<span className="text-[#80cbc4]">Base64</span>/<span className="text-[#aed581]">URL</span>/<span className="text-[#ff8a65]">Hash</span> Tools
      </h1>

      <Section>
        <h2 className="text-[#f0c808] text-xl mb-3"><span className="text-[#80cbc4]">Text to Base64</span> / <span className="text-[#80cbc4]">Base64 to Text</span></h2>
        <textarea
          value={base64Input}
          onChange={e => setBase64Input(e.target.value)}
          placeholder="Enter text or Base64"
          className="w-full min-h-[100px] mb-2 p-2 bg-[#333] text-[#d4d4d4] border border-[#555] rounded"
        />
        <Btn onClick={textToBase64}>Text to Base64</Btn>
        <Btn onClick={base64ToText}>Base64 to Text</Btn>
        <Output value={base64Output} />
      </Section>

      <Section>
        <h2 className="text-[#f0c808] text-xl mb-3"><span className="text-[#80cbc4]">URL-safe Base64</span> Encode / Decode</h2>
        <textarea
          value={urlSafeInput}
          onChange={e => setUrlSafeInput(e.target.value)}
          placeholder="Enter text or URL-safe Base64"
          className="w-full min-h-[100px] mb-2 p-2 bg-[#333] text-[#d4d4d4] border border-[#555] rounded"
        />
        <Btn onClick={textToUrlSafeBase64}>Text to URL-safe Base64</Btn>
        <Btn onClick={urlSafeBase64ToText}>URL-safe Base64 to Text</Btn>
        <Output value={urlSafeOutput} />
      </Section>

      <Section>
        <h2 className="text-[#f0c808] text-xl mb-3"><span className="text-[#aed581]">URL</span> Encode / Decode</h2>
        <textarea
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          placeholder="Enter URL"
          className="w-full min-h-[100px] mb-2 p-2 bg-[#333] text-[#d4d4d4] border border-[#555] rounded"
        />
        <h3 className="font-bold mt-3 mb-2">Full Mode</h3>
        <Btn onClick={urlEncodeFull}>Encode</Btn>
        <Btn onClick={urlDecodeFull}>Decode</Btn>
        <Output value={urlFullOutput} />
        <h3 className="font-bold mt-3 mb-2">Components Mode</h3>
        <Btn onClick={urlEncodeComp}>Encode Component</Btn>
        <Btn onClick={urlDecodeComp}>Decode Component</Btn>
        <Output value={urlCompOutput} />
        <h3 className="font-bold mt-3 mb-2">Parameters Mode</h3>
        <Btn onClick={urlEncodeParams}>Encode Parameters</Btn>
        <Btn onClick={urlDecodeParams}>Decode Parameters</Btn>
        <Output value={urlParamOutput} />
      </Section>

      <Section>
        <h2 className="text-[#f0c808] text-xl mb-3"><span className="text-[#ff8a65]">Text Hashing</span> (MD5, SHA1, SHA256)</h2>
        <textarea
          value={hashInput}
          onChange={e => setHashInput(e.target.value)}
          placeholder="Enter text to hash"
          className="w-full min-h-[100px] mb-2 p-2 bg-[#333] text-[#d4d4d4] border border-[#555] rounded"
        />
        <Btn onClick={calcMD5}>Calculate MD5</Btn>
        <Btn onClick={calcSHA1}>Calculate SHA1</Btn>
        <Btn onClick={calcSHA256}>Calculate SHA256</Btn>
        {md5Output && <Output value={`MD5: ${md5Output}`} />}
        {sha1Output && <Output value={`SHA1: ${sha1Output}`} />}
        {sha256Output && <Output value={`SHA256: ${sha256Output}`} />}
      </Section>

      <Section>
        <h2 className="text-[#f0c808] text-xl mb-3"><span className="text-[#ff8a65]">File Hashing</span> - Drag & Drop or Select Files</h2>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all bg-[#333] ${dragOver ? 'border-[#80cbc4] bg-[#2a3f3d]' : 'border-[#666] hover:border-[#80cbc4]'}`}
        >
          <p>Drag and drop files here or click to select</p>
          <p className="text-xs text-gray-500 mt-2">Supports any file type for hash calculation</p>
        </div>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
        {fileInfo && <div className="mt-2 text-sm text-gray-400">{fileInfo}</div>}
        {fileResults.map((f, i) => (
          <div key={i} className="mt-4 bg-[#2a2a2a] border border-[#555] rounded p-3">
            <h3 className="text-[#f0c808] font-bold mb-2">{f.name}</h3>
            <p className="text-xs text-gray-400 mb-3">Size: {formatSize(f.size)} | Type: {f.type}</p>
            <div className="bg-[#1a1a1a] p-2 rounded mb-2"><span className="text-[#f0c808] font-bold">MD5:</span> <span className="font-mono">{f.md5}</span></div>
            <div className="bg-[#1a1a1a] p-2 rounded mb-2"><span className="text-[#f0c808] font-bold">SHA1:</span> <span className="font-mono">{f.sha1}</span></div>
            <div className="bg-[#1a1a1a] p-2 rounded"><span className="text-[#f0c808] font-bold">SHA256:</span> <span className="font-mono">{f.sha256}</span></div>
          </div>
        ))}
      </Section>
    </div>
  )
}
