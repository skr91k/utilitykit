import { useState } from 'react'
import { Link } from 'react-router-dom'
import './Home.css'

const utilities = [
  { id: 1, name: 'Counter', path: '/counter', description: 'Simple click counter' },
  { id: 2, name: 'P&L Dashboard', path: '/pl', description: 'Profit & Loss Dashboard' },
  { id: 3, name: 'QR Code Generator', path: '/qr', description: 'Generate QR codes instantly' },
  { id: 4, name: 'Encryption Tool', path: '/encrypt', description: 'Encrypt/Decrypt with AES, DES, etc.' },
  { id: 5, name: 'Epoch Converter', path: '/epoch', description: 'Convert Unix timestamps' },
  { id: 6, name: 'SQLite Viewer', path: '/sqlite', description: 'View SQLite database files' },
  { id: 7, name: 'String Tools', path: '/string', description: 'Base64, URL encode, Hash' },
  { id: 8, name: 'Prayer Times', path: '/prayer', description: 'Islamic prayer times calculator' },
  { id: 9, name: 'Coming Soon', path: '#', description: 'More utilities coming...' },
  { id: 10, name: 'Coming Soon', path: '#', description: 'More utilities coming...' },
]

function Home() {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredUtilities = utilities.filter(util => {
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
              <Link to={util.path} className="utility-link">
                <span className="utility-name">{util.name}</span>
                <span className="utility-desc">{util.description}</span>
              </Link>
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
