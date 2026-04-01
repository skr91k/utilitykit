import { useState, useEffect } from 'react'

export function EpochConverter() {
  const [currentEpoch, setCurrentEpoch] = useState(Math.floor(Date.now() / 1000))
  const [timestampInput, setTimestampInput] = useState('')
  const [timestampUnit, setTimestampUnit] = useState('seconds')
  const [epochOutput, setEpochOutput] = useState('')
  const [humanDateInput, setHumanDateInput] = useState('')
  const [humanDateUnit, setHumanDateUnit] = useState('seconds')
  const [humanOutput, setHumanOutput] = useState('')

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentEpoch(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const epochToHuman = () => {
    if (!timestampInput) {
      setEpochOutput('<span class="text-red-400">Please enter a timestamp.</span>')
      return
    }

    const timestamp = parseFloat(timestampInput)
    let date: Date

    switch (timestampUnit) {
      case 'seconds': date = new Date(timestamp * 1000); break
      case 'milliseconds': date = new Date(timestamp); break
      case 'microseconds': date = new Date(timestamp / 1000); break
      case 'nanoseconds': date = new Date(timestamp / 1000000); break
      default: return
    }

    const gmtDate = date.toISOString().replace('T', ' ').slice(0, -5) + 'Z'
    const localDate = date.toLocaleString()
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    let relativeTime
    if (Math.abs(diffInSeconds) < 60) relativeTime = `${Math.abs(diffInSeconds)} seconds ${diffInSeconds > 0 ? 'ago' : 'from now'}`
    else if (Math.abs(diffInSeconds) < 3600) relativeTime = `${Math.floor(Math.abs(diffInSeconds) / 60)} minutes ${diffInSeconds > 0 ? 'ago' : 'from now'}`
    else if (Math.abs(diffInSeconds) < 86400) relativeTime = `${Math.floor(Math.abs(diffInSeconds) / 3600)} hours ${diffInSeconds > 0 ? 'ago' : 'from now'}`
    else relativeTime = `${Math.floor(Math.abs(diffInSeconds) / 86400)} days ${diffInSeconds > 0 ? 'ago' : 'from now'}`

    const tzOffset = new Date().getTimezoneOffset()
    const tzSign = tzOffset > 0 ? '-' : '+'
    const tzHours = Math.abs(Math.floor(tzOffset / 60)).toString().padStart(2, '0')
    const tzMins = (Math.abs(tzOffset) % 60).toString().padStart(2, '0')

    setEpochOutput(`
      <p>Assuming that this timestamp is in <strong class="text-[#a7d1eb]">${timestampUnit}</strong>:</p>
      <p><strong class="text-[#a7d1eb]">GMT:</strong> ${gmtDate}</p>
      <p><strong class="text-[#a7d1eb]">Your time zone:</strong> ${localDate} (GMT${tzSign}${tzHours}:${tzMins})</p>
      <p><strong class="text-[#a7d1eb]">Relative:</strong> ${relativeTime}</p>
    `)
  }

  const humanToEpoch = () => {
    if (!humanDateInput) {
      setHumanOutput('<span class="text-red-400">Please enter a human date.</span>')
      return
    }

    const date = new Date(humanDateInput)
    if (isNaN(date.getTime())) {
      setHumanOutput('<span class="text-red-400">Invalid date format. Please use YYYY-MM-DD HH:MM:SS.</span>')
      return
    }

    const timestamp = humanDateUnit === 'seconds' ? Math.floor(date.getTime() / 1000) : date.getTime()
    setHumanOutput(`<p>The Unix timestamp in <strong class="text-[#a7d1eb]">${humanDateUnit}</strong> is: <strong class="text-[#a7d1eb]">${timestamp}</strong></p>`)
  }

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#d4d4d4] p-5">
      <h1 className="text-[#eee] text-2xl font-bold mb-4">
        <span className="text-[#a7d1eb]">Epoch</span> & <span className="text-[#f08080]">Unix</span> Timestamp Converter
      </h1>

      <p className="text-[#bbb] mb-4">
        The current <strong className="text-[#a7d1eb]">Unix epoch time</strong> is <strong className="text-[#a7d1eb]">{currentEpoch}</strong>
      </p>

      <div className="mb-5 p-4 border border-[#333] rounded bg-[#252525]">
        <h2 className="text-[#eee] text-xl mb-4">
          <span className="text-[#a7d1eb]">Timestamp</span> to Human Date
        </h2>
        <label className="block mb-1 font-bold text-[#ccc]">
          Enter Unix Timestamp (<span className="text-[#f08080]">seconds</span>, <span className="text-[#f08080]">milliseconds</span>, <span className="text-[#f08080]">microseconds</span>, or <span className="text-[#f08080]">nanoseconds</span>):
        </label>
        <input
          type="number"
          value={timestampInput}
          onChange={(e) => setTimestampInput(e.target.value)}
          placeholder="e.g., 1678886400 or 1678886400000"
          className="w-full p-2 mb-2 border border-[#555] rounded bg-[#333] text-[#eee]"
        />
        <label className="block mb-1 font-bold text-[#ccc]">Unit:</label>
        <select
          value={timestampUnit}
          onChange={(e) => setTimestampUnit(e.target.value)}
          className="w-full p-2 mb-2 border border-[#555] rounded bg-[#333] text-[#eee]"
        >
          <option value="seconds">Seconds</option>
          <option value="milliseconds">Milliseconds</option>
          <option value="microseconds">Microseconds</option>
          <option value="nanoseconds">Nanoseconds</option>
        </select>
        <button onClick={epochToHuman} className="px-4 py-2 bg-[#007bff] text-white border-none rounded cursor-pointer hover:bg-[#0056b3]">
          Convert to Human Date
        </button>
        <div className="mt-2 p-2 border border-[#444] rounded bg-[#333] text-[#eee]" dangerouslySetInnerHTML={{ __html: epochOutput }} />
      </div>

      <div className="mb-5 p-4 border border-[#333] rounded bg-[#252525]">
        <h2 className="text-[#eee] text-xl mb-4">
          Human Date to <span className="text-[#a7d1eb]">Timestamp</span>
        </h2>
        <label className="block mb-1 font-bold text-[#ccc]">
          Enter Human Date (<span className="text-[#f08080]">YYYY-MM-DD HH:MM:SS</span>):
        </label>
        <input
          type="text"
          value={humanDateInput}
          onChange={(e) => setHumanDateInput(e.target.value)}
          placeholder="e.g., 2023-03-15 10:00:00"
          className="w-full p-2 mb-2 border border-[#555] rounded bg-[#333] text-[#eee]"
        />
        <label className="block mb-1 font-bold text-[#ccc]">Output Unit:</label>
        <select
          value={humanDateUnit}
          onChange={(e) => setHumanDateUnit(e.target.value)}
          className="w-full p-2 mb-2 border border-[#555] rounded bg-[#333] text-[#eee]"
        >
          <option value="seconds">Seconds</option>
          <option value="milliseconds">Milliseconds</option>
        </select>
        <button onClick={humanToEpoch} className="px-4 py-2 bg-[#007bff] text-white border-none rounded cursor-pointer hover:bg-[#0056b3]">
          Convert to Timestamp
        </button>
        <div className="mt-2 p-2 border border-[#444] rounded bg-[#333] text-[#eee]" dangerouslySetInnerHTML={{ __html: humanOutput }} />
      </div>
    </div>
  )
}
