import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import './Counter.css'

function Counter() {
  const [count, setCount] = useState(() => {
    const savedCount = localStorage.getItem('counter_count');
    return savedCount ? parseInt(savedCount, 10) : 0;
  });
  
  const [delayMs, setDelayMs] = useState(() => {
    const savedDelay = localStorage.getItem('counter_delay');
    return savedDelay ? parseInt(savedDelay, 10) : 500;
  });

  const [cooldown, setCooldown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Persist count
  useEffect(() => {
    localStorage.setItem('counter_count', count.toString());
  }, [count]);

  // Persist delay
  useEffect(() => {
    localStorage.setItem('counter_delay', delayMs.toString());
  }, [delayMs]);

  const handleIncrement = useCallback(() => {
    setCount((prev) => {
      // Check cooldown via functional update might be tricky with async, 
      // but we handle cooldown in the outer scope
      return prev + 1;
    });
    
    if (delayMs > 0) {
      setCooldown(true);
      setTimeout(() => setCooldown(false), delayMs);
    }
  }, [delayMs]);

  const handleInteraction = useCallback((e?: React.SyntheticEvent | KeyboardEvent) => {
    if (e && 'preventDefault' in e && e.type === 'keydown') {
      // Only prevent default for spacebar if we are not in an input
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === 'input') return;
      e.preventDefault();
    }
    
    if (cooldown) return;
    
    handleIncrement();
  }, [cooldown, handleIncrement]);

  // Keyboard support for spacebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        handleInteraction(e);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleInteraction]);

  const handleReset = () => {
    setCount(0);
    setCooldown(false);
  };

  return (
    <div className="counter-page">
      <Link to="/" className="back-link">← Back</Link>

      <div className="top-right-controls">
        <button 
          className="icon-btn" 
          onClick={() => setShowSettings(!showSettings)}
          aria-label="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button className="reset-btn" onClick={handleReset}>
          Reset
        </button>
      </div>

      {showSettings && (
        <div className="settings-panel">
          <div className="settings-header">
            <h3>Settings</h3>
            <button className="close-btn" onClick={() => setShowSettings(false)}>×</button>
          </div>
          <div className="setting-item">
            <label htmlFor="delay-slider">
              Click Delay (0-2s) to prevent double clicks: <strong>{(delayMs / 1000).toFixed(1)}s</strong>
            </label>
            <input 
              id="delay-slider"
              type="range" 
              min="0" 
              max="2000" 
              step="100" 
              value={delayMs} 
              onChange={(e) => setDelayMs(parseInt(e.target.value, 10))}
            />
          </div>
          <div className="setting-item helper-text">
            * Keyboard users: Press [Space] to act as click.
          </div>
        </div>
      )}

      <div 
        className={`counter-circle ${cooldown ? 'cooldown' : ''}`} 
        onClick={(e) => handleInteraction(e)}
      >
        <span className="counter-value">{count}</span>
      </div>
    </div>
  )
}

export default Counter
