import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { RouteTracker } from './components/RouteTracker'
import Home from './pages/Home'
import Counter from './pages/Counter'
import { QRCodeGenerator } from './pages/QRCodeGenerator'
import { Encryption } from './pages/Encryption'
import { EpochConverter } from './pages/EpochConverter'
import { SQLiteViewer } from './pages/SQLiteViewer'
import { StringConverts } from './pages/StringConverts'
import { PrayerTime } from './pages/PrayerTime'
import { WorkoutManager } from './pages/WorkoutManager'
import { ContactUs } from './pages/ContactUs'
import { SupportChat } from './pages/SupportChat'
import { SplitExpense } from './pages/SplitExpense'
import { CricketTracker } from './pages/CricketTracker'
import { JWTDecoder } from './pages/JWTDecoder'
import { BhavUnpacker } from './pages/BhavUnpacker'
import { TVChart } from './pages/TVChart'
import { PasteBin } from './pages/PasteBin'
import { PasteView } from './pages/PasteView'
import { ZipRepair } from './pages/ZipRepair'
import { FuelTracker } from './pages/FuelTracker'
import { IPRedirect } from './pages/IPRedirect'
import { MoneyFlow } from './pages/MoneyFlow'

function App() {
  return (
    <BrowserRouter>
      <RouteTracker />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/counter" element={<Counter />} />
        <Route path="/qr" element={<QRCodeGenerator />} />
        <Route path="/encrypt" element={<Encryption />} />
        <Route path="/epoch" element={<EpochConverter />} />
        <Route path="/sqlite" element={<SQLiteViewer />} />
        <Route path="/string" element={<StringConverts />} />
        <Route path="/prayer" element={<PrayerTime />} />
        <Route path="/workout" element={<WorkoutManager />} />
        <Route path="/contactus" element={<ContactUs />} />
        <Route path="/support" element={<SupportChat />} />
        <Route path="/split" element={<SplitExpense />} />
        <Route path="/split/:bookId" element={<SplitExpense />} />
        <Route path="/cricket" element={<CricketTracker />} />
        <Route path="/cricket/:token" element={<CricketTracker />} />
        <Route path="/jwt" element={<JWTDecoder />} />
        <Route path="/priceDecoder" element={<BhavUnpacker />} />
        <Route path="/tv" element={<TVChart />} />
        <Route path="/paste" element={<PasteBin />} />
        <Route path="/paste/:kind/:id" element={<PasteView />} />
        <Route path="/ziprepair" element={<ZipRepair />} />
        <Route path="/fuel" element={<FuelTracker />} />
        <Route path="/ip" element={<IPRedirect />} />
        <Route path="/money" element={<MoneyFlow />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
