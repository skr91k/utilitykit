import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../utils/useAuth'
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
  { id: 13, icon: '📤', name: 'File Share p2p', path: 'http://165.22.213.93:8000/fileshare/', description: 'Share Files across devices p2p /relay' },
  { id: 10, icon: '🚀', name: 'Coming Soon', path: '#', description: 'More utilities coming...' },
]

function Home() {
  const { user, loading, login, logout, loginAnonymous } = useAuth()
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
        <div className="auth-section">
          {loading ? (
            <span className="auth-loading">...</span>
          ) : user ? (
            <div className="auth-user">
              {user.photoURL && <img src={user.photoURL} alt="" className="auth-avatar" />}
              <span className="auth-name">{user.displayName?.split(' ')[0]}</span>
              <button onClick={logout} className="auth-btn logout-btn">Logout</button>
            </div>
          ) : (
            <div className="auth-buttons">
              <button onClick={login} className="auth-btn login-btn">
                <svg viewBox="0 0 24 24" width="18" height="18" style={{ marginRight: '8px' }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
              <button onClick={loginAnonymous} className="auth-btn login-btn">
                Guest
              </button>
            </div>
          )}
        </div>
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
