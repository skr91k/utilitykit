import { useState } from 'react'
import { Link } from 'react-router-dom'
import './Home.css'

const utilities = [
  { id: 1, icon: '🔢', name: 'Counter', path: '/counter', description: 'Simple click counter' },
  { id: 2, icon: '📈', name: 'P&L Dashboard', path: '/pl', description: 'Profit & Loss Dashboard' },
  { id: 3, icon: '🔳', name: 'QR Code Generator', path: '/qr', description: 'Generate QR codes instantly' },
  { id: 4, icon: '🔐', name: 'Encryption Tool', path: '/encrypt', description: 'Encrypt/Decrypt with AES, DES, etc.' },
  { id: 5, icon: '⏳', name: 'Epoch Converter', path: '/epoch', description: 'Convert Unix timestamps' },
  { id: 6, icon: '🗄️', name: 'SQLite Viewer', path: '/sqlite', description: 'View SQLite database files' },
  { id: 7, icon: '🔤', name: 'String Tools', path: '/string', description: 'Base64, URL encode, Hash' },
  { id: 8, icon: '🕌', name: 'Prayer Times', path: '/prayer', description: 'Islamic prayer times calculator' },
  { id: 9, icon: '💪', name: 'Workout Manager', path: '/workout', description: 'Track reps, steps & rest timer' },
  { id: 11, icon: '📺', name: 'TV Channels', path: 'https://tv1.web.app/', description: 'Watch Live TV Channels' },
  { id: 12, icon: '📚', name: 'Islamic Books', path: 'https://islamicbooks2.web.app/', description: 'Read Islamic Books Online' },
  { id: 10, icon: '🚀', name: 'Coming Soon', path: '#', description: 'More utilities coming...' },
]

function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [recentClicks, setRecentClicks] = useState<number[]>(() => {
    const saved = localStorage.getItem('utilityRecentClicks')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        return []
      }
    }
    return []
  })

  const handleUtilityClick = (id: number) => {
    window.scrollTo(0, 0)
    setRecentClicks(prev => {
      if (id === 10) return prev
      const filtered = prev.filter(clickId => clickId !== id)
      const updated = [id, ...filtered]
      localStorage.setItem('utilityRecentClicks', JSON.stringify(updated))
      return updated
    })
  }

  const sortedUtilities = Array.from(new Set([
    ...recentClicks.map(id => utilities.find(u => u.id === id)).filter((u): u is (typeof utilities)[0] => u !== undefined && u.id !== 10),
    ...utilities.filter(u => u.id !== 10),
    utilities.find(u => u.id === 10)!
  ]));

  const filteredUtilities = sortedUtilities.filter(util => {
    if (!searchQuery) return true;
    if (util.name === 'Coming Soon') return false;
    
    const query = searchQuery.toLowerCase();
    return (
      util.name.toLowerCase().includes(query) ||
      util.description.toLowerCase().includes(query)
    );
  });

  return (
    <div className="home-container">
      <div className="home">
        <h1>Utilities</h1>
        
        <div className="search-container">
          <input 
            type="text" 
            className="search-input"
            placeholder="Search utilities..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <ul className="utility-list">
          {filteredUtilities.map((util) => (
            <li key={util.id} className="utility-item">
              {util.path.startsWith('http') ? (
                <a href={util.path} className="utility-link" onClick={() => handleUtilityClick(util.id)}>
                  <span className="utility-name"><span className="utility-icon" style={{ marginRight: '8px' }}>{util.icon}</span>{util.name}</span>
                  <span className="utility-desc">{util.description}</span>
                </a>
              ) : (
                <Link to={util.path} className="utility-link" onClick={() => handleUtilityClick(util.id)}>
                  <span className="utility-name"><span className="utility-icon" style={{ marginRight: '8px' }}>{util.icon}</span>{util.name}</span>
                  <span className="utility-desc">{util.description}</span>
                </Link>
              )}
            </li>
          ))}
          {filteredUtilities.length === 0 && (
            <div className="no-results">No utilities found for "{searchQuery}"</div>
          )}
        </ul>
      </div>
    </div>
  )
}

export default Home
