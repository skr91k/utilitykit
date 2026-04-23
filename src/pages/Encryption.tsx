import { useState, useEffect } from 'react'
import { useSEO } from '../utils/useSEO'

declare global {
  interface Window {
    CryptoJS: any
  }
}

const algorithms = [
  { id: 'aes', name: 'AES' },
  { id: 'des', name: 'DES' },
  { id: 'rc4', name: 'RC4' },
  { id: 'rabbit', name: 'Rabbit' },
  { id: 'tripledes', name: 'Triple DES' },
]

type ResultItem = { id: string; name: string; result: string; success: boolean }

export function Encryption() {
  useSEO({
    title: 'Text Encryption & Decryption',
    description: 'Encrypt and decrypt text using AES, DES, Triple DES, and Rabbit algorithms. Secure client-side encryption with customizable secret keys.',
    keywords: 'encryption, decryption, aes, des, triple des, rabbit, cipher, secure text, crypto',
  });

  const [operation, setOperation] = useState<'encrypt' | 'decrypt'>('encrypt')
  const [secret, setSecret] = useState('')
  const [encryptInput, setEncryptInput] = useState('')
  const [decryptInput, setDecryptInput] = useState('')
  const [encryptResults, setEncryptResults] = useState<ResultItem[]>([])
  const [decryptResults, setDecryptResults] = useState<ResultItem[]>([])
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
    if (!decrypted) throw new Error('Failed')
    return decrypted
  }

  const process = () => {
    const input = operation === 'encrypt' ? encryptInput : decryptInput
    if (!secret || !input) {
      showAlert('Please provide both a secret key and input text', 'error')
      return
    }

    const newResults: ResultItem[] = []

    for (const algo of algorithms) {
      try {
        const result = operation === 'encrypt'
          ? encrypt(algo.id, input, secret)
          : decrypt(algo.id, input, secret)
        newResults.push({ id: algo.id, name: algo.name, result, success: true })
      } catch {
        newResults.push({ id: algo.id, name: algo.name, result: 'Failed to decrypt', success: false })
      }
    }

    // Sort: successful first, failed last
    newResults.sort((a, b) => (b.success ? 1 : 0) - (a.success ? 1 : 0))

    if (operation === 'encrypt') {
      setEncryptResults(newResults)
    } else {
      setDecryptResults(newResults)
    }
    const successCount = newResults.filter(r => r.success).length
    showAlert(`${operation === 'encrypt' ? 'Encrypted' : 'Decrypted'} with ${successCount}/${algorithms.length} algorithms`, 'success')
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => showAlert('Copied to clipboard!', 'success'))
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
          <label className="block mb-2 text-[#00bfff]">{operation === 'encrypt' ? 'Text to Encrypt' : 'Ciphertext to Decrypt'}</label>
          <textarea
            value={operation === 'encrypt' ? encryptInput : decryptInput}
            onChange={(e) => operation === 'encrypt' ? setEncryptInput(e.target.value) : setDecryptInput(e.target.value)}
            placeholder={operation === 'encrypt' ? 'Enter text to encrypt' : 'Enter ciphertext to decrypt'}
            className="w-full p-3 rounded-md border border-[#333] bg-[#121212] text-[#f0f0f0] min-h-[100px] font-mono resize-y"
          />
        </div>

        <button
          onClick={process}
          className="w-full p-3 bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white border-none rounded-md font-bold uppercase tracking-wide cursor-pointer hover:from-[#00bfff] hover:to-[#8a2be2] transition-all"
        >
          {operation.charAt(0).toUpperCase() + operation.slice(1)}
        </button>

        <div className="mt-6 space-y-3">
          {(operation === 'encrypt' ? encryptResults : decryptResults).length === 0 ? (
            <div className="p-4 rounded-md bg-[#121212] text-gray-400 text-center">
              Results will appear here
            </div>
          ) : (
            (operation === 'encrypt' ? encryptResults : decryptResults).map((item) => (
              <div
                key={item.id}
                className={`p-4 rounded-md relative ${item.success ? 'bg-[#121212]' : 'bg-[#1a1212] opacity-60'}`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className={`font-semibold ${item.success ? 'text-[#00bfff]' : 'text-red-400'}`}>
                    {item.name}
                    {item.success && <span className="ml-2 text-green-400 text-xs">✓</span>}
                  </span>
                  {item.success && (
                    <button
                      onClick={() => copyToClipboard(item.result)}
                      className="bg-[#ff1493] text-white border-none rounded px-2 py-1 text-xs cursor-pointer"
                    >
                      Copy
                    </button>
                  )}
                </div>
                <div className={`font-mono text-sm break-all ${item.success ? 'text-gray-300' : 'text-red-300'}`}>
                  {item.result}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
