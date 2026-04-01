import { useState, useEffect } from 'react'

declare global {
  interface Window {
    CryptoJS: any
  }
}

export function Encryption() {
  const [operation, setOperation] = useState<'encrypt' | 'decrypt'>('encrypt')
  const [algorithm, setAlgorithm] = useState('aes')
  const [secret, setSecret] = useState('')
  const [input, setInput] = useState('')
  const [result, setResult] = useState('Result will appear here')
  const [alert, setAlert] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js'
    script.async = true
    document.body.appendChild(script)
    return () => {
      document.body.removeChild(script)
    }
  }, [])

  const showAlert = (message: string, type: 'success' | 'error') => {
    setAlert({ message, type })
    setTimeout(() => setAlert(null), 3000)
  }

  const encrypt = (algo: string, text: string, key: string) => {
    const CryptoJS = window.CryptoJS
    switch (algo) {
      case 'aes': return CryptoJS.AES.encrypt(text, key).toString()
      case 'des': return CryptoJS.DES.encrypt(text, key).toString()
      case 'rc4': return CryptoJS.RC4.encrypt(text, key).toString()
      case 'rabbit': return CryptoJS.Rabbit.encrypt(text, key).toString()
      case 'tripledes': return CryptoJS.TripleDES.encrypt(text, key).toString()
      default: throw new Error('Unknown algorithm')
    }
  }

  const decrypt = (algo: string, ciphertext: string, key: string) => {
    const CryptoJS = window.CryptoJS
    let bytes
    switch (algo) {
      case 'aes': bytes = CryptoJS.AES.decrypt(ciphertext, key); break
      case 'des': bytes = CryptoJS.DES.decrypt(ciphertext, key); break
      case 'rc4': bytes = CryptoJS.RC4.decrypt(ciphertext, key); break
      case 'rabbit': bytes = CryptoJS.Rabbit.decrypt(ciphertext, key); break
      case 'tripledes': bytes = CryptoJS.TripleDES.decrypt(ciphertext, key); break
      default: throw new Error('Unknown algorithm')
    }
    const decrypted = bytes.toString(CryptoJS.enc.Utf8)
    if (!decrypted) throw new Error('Invalid key or corrupt ciphertext')
    return decrypted
  }

  const process = () => {
    if (!secret || !input) {
      showAlert('Please provide both a secret key and input text', 'error')
      return
    }
    try {
      const res = operation === 'encrypt' ? encrypt(algorithm, input, secret) : decrypt(algorithm, input, secret)
      setResult(res)
      showAlert(`Text ${operation}ed successfully!`, 'success')
    } catch (error: any) {
      showAlert(`Error: ${error.message}`, 'error')
    }
  }

  const copyResult = () => {
    navigator.clipboard.writeText(result).then(() => showAlert('Copied to clipboard!', 'success'))
  }

  return (
    <div className="min-h-screen bg-[#121212] text-[#f0f0f0] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[800px] p-8 bg-[#1e1e1e] rounded-xl shadow-lg">
        <h1 className="text-center text-[#00bfff] text-2xl font-bold mb-8">String Encryption Tool</h1>

        <div className="flex mb-6">
          <div
            onClick={() => setOperation('encrypt')}
            className={`flex-1 p-3 text-center bg-[#121212] cursor-pointer border-b-[3px] ${operation === 'encrypt' ? 'border-[#ff1493] text-[#ff1493] font-bold' : 'border-transparent'}`}
          >
            Encrypt
          </div>
          <div
            onClick={() => setOperation('decrypt')}
            className={`flex-1 p-3 text-center bg-[#121212] cursor-pointer border-b-[3px] ${operation === 'decrypt' ? 'border-[#ff1493] text-[#ff1493] font-bold' : 'border-transparent'}`}
          >
            Decrypt
          </div>
        </div>

        {alert && (
          <div className={`p-3 mb-4 rounded text-white font-bold text-center ${alert.type === 'success' ? 'bg-green-600/80' : 'bg-red-600/80'}`}>
            {alert.message}
          </div>
        )}

        <div className="mb-6">
          <label className="block mb-2 text-[#00bfff]">Encryption Algorithm</label>
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
            className="w-full p-3 rounded-md border border-[#333] bg-[#121212] text-[#f0f0f0]"
          >
            <option value="aes">AES (Advanced Encryption Standard)</option>
            <option value="des">DES (Data Encryption Standard)</option>
            <option value="rc4">RC4 (Rivest Cipher 4)</option>
            <option value="rabbit">Rabbit</option>
            <option value="tripledes">Triple DES</option>
          </select>
        </div>

        <div className="mb-6">
          <label className="block mb-2 text-[#00bfff]">Secret Key</label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter your secret key"
            className="w-full p-3 rounded-md border border-[#333] bg-[#121212] text-[#f0f0f0]"
          />
        </div>

        <div className="mb-6">
          <label className="block mb-2 text-[#00bfff]">Input Text</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter text to encrypt/decrypt"
            className="w-full p-3 rounded-md border border-[#333] bg-[#121212] text-[#f0f0f0] min-h-[100px] font-mono resize-y"
          />
        </div>

        <button
          onClick={process}
          className="w-full p-3 bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white border-none rounded-md font-bold uppercase tracking-wide cursor-pointer hover:from-[#00bfff] hover:to-[#8a2be2] transition-all"
        >
          {operation.charAt(0).toUpperCase() + operation.slice(1)}
        </button>

        <div className="mt-6 p-4 rounded-md bg-[#121212] font-mono break-all relative">
          {result}
          <button
            onClick={copyResult}
            className="absolute top-2 right-2 bg-[#ff1493] text-white border-none rounded px-2 py-1 text-xs cursor-pointer"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  )
}
