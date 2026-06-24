import { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import AddResultsModal from './components/AddResultsModal.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ParameterTracking from './pages/ParameterTracking.jsx'
import Parameters from './pages/Parameters.jsx'
import Tasks from './pages/Tasks.jsx'
import Livestock from './pages/Livestock.jsx'
import Journal from './pages/Journal.jsx'
import Equipment from './pages/Equipment.jsx'
import Settings from './pages/Settings.jsx'
import Placeholder from './pages/Placeholder.jsx'
import { TankProvider } from './TankContext.jsx'
import { useTheme } from './useTheme.js'

const today = new Date().toLocaleDateString('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

// Per-screen header text. Screens beyond Phase 1 render a Placeholder.
const PAGES = {
  home: { title: 'Dashboard', subtitle: `${today} · everything's looking steady`, el: Dashboard },
  log: { title: 'Parameter Tracking', subtitle: 'Your test-result history — out-of-range values flagged.', el: ParameterTracking },
  charts: { title: 'Historic Trends', subtitle: 'Trends over time.', el: Parameters },
  settings: { title: 'Settings', subtitle: 'Parameters, notifications & data.', el: Settings },
  tasks: { title: 'Tasks', subtitle: 'Mark done — recurrence handles the rest.', el: Tasks },
  livestock: { title: 'Livestock', subtitle: 'Who lives here — with honest stocking notes.', el: Livestock },
  journal: { title: 'Journal', subtitle: 'A dated log of what happened in the tank.', el: Journal },
  equipment: { title: 'Equipment', subtitle: 'The gear running your tank — brand, model & notes.', el: Equipment },
  consumables: { title: 'Consumables', subtitle: 'Coming in Phase 5.', el: Placeholder },
}

export default function App() {
  const [theme, setTheme] = useTheme()
  const [active, setActive] = useState('home')
  const [logOpen, setLogOpen] = useState(false)
  const [logBump, setLogBump] = useState(0) // bumped after a save so views refetch
  const [navOpen, setNavOpen] = useState(false) // mobile nav drawer

  const page = PAGES[active] || PAGES.home
  const Page = page.el

  return (
    <TankProvider>
      <div className="app">
        <Sidebar
          active={active}
          open={navOpen}
          onClose={() => setNavOpen(false)}
          onNavigate={(id) => {
            setActive(id)
            setNavOpen(false)
          }}
        />
        <main className="main">
          <TopBar
            title={page.title}
            subtitle={page.subtitle}
            theme={theme}
            onTheme={setTheme}
            onLog={() => setLogOpen(true)}
            onMenu={() => setNavOpen(true)}
          />
          <Page screen={active} onNavigate={setActive} logBump={logBump} />
        </main>
      </div>

      {logOpen ? (
        <AddResultsModal
          onClose={() => setLogOpen(false)}
          onSaved={() => {
            setLogOpen(false)
            setLogBump((b) => b + 1)
          }}
        />
      ) : null}
    </TankProvider>
  )
}
