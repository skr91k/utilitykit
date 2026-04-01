import { useState, useRef } from 'react'

declare global {
  interface Window {
    initSqlJs: any
  }
}

export function SQLiteViewer() {
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [dbInfo, setDbInfo] = useState('')
  const [tables, setTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState('')
  const [tableInfo, setTableInfo] = useState({ rows: 0, cols: 0 })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ columns: string[]; values: any[][] } | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const dbRef = useRef<any>(null)
  const SQLRef = useRef<any>(null)

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' bytes'
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB'
    else return (bytes / 1048576).toFixed(2) + ' MB'
  }

  const loadScript = () => {
    return new Promise<void>((resolve, reject) => {
      if (window.initSqlJs) {
        resolve()
        return
      }
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load SQL.js'))
      document.body.appendChild(script)
    })
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setLoading(true)
      setLoadingText('Loading SQLite engine...')
      setError('')

      await loadScript()

      if (!SQLRef.current) {
        SQLRef.current = await window.initSqlJs({
          locateFile: (f: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${f}`
        })
      }

      setLoadingText('Reading database file...')

      const buffer = await file.arrayBuffer()
      if (dbRef.current) dbRef.current.close()
      dbRef.current = new SQLRef.current.Database(new Uint8Array(buffer))

      setDbInfo(`File size: ${formatFileSize(file.size)}`)

      const tablesResult = dbRef.current.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      if (tablesResult.length > 0) {
        setTables(tablesResult[0].values.map((t: any) => t[0]))
      }

      setLoading(false)
    } catch (err: any) {
      setLoading(false)
      setError(`Error loading database: ${err.message}`)
    }
  }

  const handleTableSelect = (tableName: string) => {
    if (!tableName || !dbRef.current) return
    setSelectedTable(tableName)
    setError('')

    try {
      const info = dbRef.current.exec(`PRAGMA table_info("${tableName}")`)
      const count = dbRef.current.exec(`SELECT COUNT(*) FROM "${tableName}"`)

      setTableInfo({
        cols: info.length > 0 ? info[0].values.length : 0,
        rows: count.length > 0 ? count[0].values[0][0] : 0
      })

      setQuery(`SELECT * FROM ${tableName} LIMIT 100`)
      executeQuery(`SELECT * FROM ${tableName} LIMIT 100`)
    } catch (err: any) {
      setError(`Error: ${err.message}`)
    }
  }

  const executeQuery = (q?: string) => {
    const queryToRun = q || query
    if (!queryToRun.trim() || !dbRef.current) {
      setError('Please enter a SQL query.')
      return
    }

    try {
      const startTime = performance.now()
      const result = dbRef.current.exec(queryToRun)
      const endTime = performance.now()

      if (result.length > 0) {
        setStatus(`Query executed in ${((endTime - startTime) / 1000).toFixed(3)} seconds, returned ${result[0].values.length} rows`)
        setResults(result[0])
      } else {
        setStatus('Query executed successfully. No results to display.')
        setResults(null)
      }
      setError('')
    } catch (err: any) {
      setError(`Error: ${err.message}`)
      setResults(null)
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#333] p-5 max-w-[1200px] mx-auto">
      <h1 className="text-[#2c3e50] text-2xl font-bold mb-5">SQLite Database Viewer</h1>

      <div className="bg-[#f9f9f9] rounded-lg p-5 shadow mb-5">
        <h3 className="font-bold mb-2">Open SQLite Database</h3>
        <p className="text-sm text-gray-600 mb-3">Select a SQLite database file (.db, .sqlite, .sqlite3) to view its contents</p>
        <input
          type="file"
          accept=".db,.sqlite,.sqlite3"
          onChange={handleFileSelect}
          className="w-full p-2 border border-[#ddd] rounded"
        />
        {loading && <div className="text-center p-5 font-bold text-[#3498db]">{loadingText}</div>}
        {dbInfo && (
          <div className="bg-[#d5f5e3] p-2 rounded mt-3">
            <strong>Database loaded!</strong> {dbInfo}
          </div>
        )}
      </div>

      {tables.length > 0 && (
        <div className="bg-[#f9f9f9] rounded-lg p-5 shadow mb-5">
          <h3 className="font-bold mb-2">Database Tables</h3>
          <select
            value={selectedTable}
            onChange={(e) => handleTableSelect(e.target.value)}
            className="w-full p-2 border border-[#ddd] rounded bg-white mb-3"
          >
            <option value="">-- Select a table --</option>
            {tables.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {selectedTable && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Rows: {tableInfo.rows}</span>
              <span>Columns: {tableInfo.cols}</span>
            </div>
          )}
        </div>
      )}

      {tables.length > 0 && (
        <div className="bg-[#f9f9f9] rounded-lg p-5 shadow mb-5">
          <h3 className="font-bold mb-2">Custom SQL Query</h3>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter SQL query here..."
            className="w-full h-24 p-2 border border-[#ddd] rounded font-mono resize-y mb-3"
          />
          <button
            onClick={() => executeQuery()}
            className="bg-[#3498db] text-white border-none px-4 py-2 rounded font-bold cursor-pointer hover:bg-[#2980b9]"
          >
            Run Query
          </button>
        </div>
      )}

      {(results || error) && (
        <div className="bg-[#f9f9f9] rounded-lg p-5 shadow">
          <h3 className="font-bold mb-2">Query Results</h3>
          {status && <div className="text-sm text-gray-600 mb-3">{status}</div>}
          {error && <div className="text-red-500 font-bold p-2 bg-red-100 rounded">{error}</div>}
          {results && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {results.columns.map((col, i) => (
                      <th key={i} className="p-3 border-b border-[#ddd] text-left bg-[#f2f2f2] font-bold">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.values.map((row, i) => (
                    <tr key={i} className="hover:bg-[#f5f5f5]">
                      {row.map((cell, j) => (
                        <td key={j} className="p-3 border-b border-[#ddd] text-left">
                          {cell === null ? 'NULL' : typeof cell === 'object' ? JSON.stringify(cell) : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
