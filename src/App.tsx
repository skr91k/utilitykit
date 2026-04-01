import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Counter from './pages/Counter'
import { PnLDashboard } from './pages/PnLDashboard'
import { PnLGraph } from './pages/PnLGraph'
import { QRCodeGenerator } from './pages/QRCodeGenerator'
import { Encryption } from './pages/Encryption'
import { EpochConverter } from './pages/EpochConverter'
import { SQLiteViewer } from './pages/SQLiteViewer'
import { StringConverts } from './pages/StringConverts'
import { PrayerTime } from './pages/PrayerTime'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/counter" element={<Counter />} />
        <Route path="/pl" element={<PnLDashboard />} />
        <Route path="/plgraph" element={<PnLGraph />} />
        <Route path="/qr" element={<QRCodeGenerator />} />
        <Route path="/encrypt" element={<Encryption />} />
        <Route path="/epoch" element={<EpochConverter />} />
        <Route path="/sqlite" element={<SQLiteViewer />} />
        <Route path="/string" element={<StringConverts />} />
        <Route path="/prayer" element={<PrayerTime />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
