import { Plus, List } from '../icons.jsx'

export default function TopBar({ title, subtitle, theme, onTheme, onLog, onMenu }) {
  return (
    <header className="topbar">
      <div className="topbar-lead">
        <button className="nav-toggle" onClick={onMenu} aria-label="Open menu">
          <List size={22} s={1.8} />
        </button>
        <div>
          <div className="page-title">{title}</div>
          {subtitle ? <div className="page-sub">{subtitle}</div> : null}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="theme-toggle">
          <button className={theme === 'light' ? 'active' : ''} onClick={() => onTheme('light')}>
            Light
          </button>
          <button className={theme === 'dark' ? 'active' : ''} onClick={() => onTheme('dark')}>
            Dark
          </button>
        </div>
        <button className="btn-primary" onClick={onLog}>
          <Plus size={16} s={2.2} />
          Add Test Results
        </button>
      </div>
    </header>
  )
}
