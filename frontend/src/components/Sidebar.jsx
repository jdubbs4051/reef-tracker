import { Icon } from '../iconMap.jsx'
import { nav } from '../data.js'
import { useTank } from '../TankContext.jsx'
import { dueInfo } from '../api.js'
import { X } from '../icons.jsx'
import logoDark from '../assets/logo-dark.png'
import logoLight from '../assets/logo-light.png'

export default function Sidebar({ active, onNavigate, open = false, onClose }) {
  const { tank, tasks } = useTank()
  const dueCount = tasks.filter((t) => dueInfo(t.next_due_at).urgent).length
  return (
    <>
      <div
        className={`nav-backdrop${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <button className="nav-close" onClick={onClose} aria-label="Close menu">
          <X size={22} s={1.8} />
        </button>
        <div className="brand">
          <div className="brand-mark">
            <img className="brand-logo brand-logo-dark" src={logoDark} alt="Reef Tracker" />
            <img className="brand-logo brand-logo-light" src={logoLight} alt="Reef Tracker" />
          </div>
          <div className="brand-name">Reef Tracker</div>
        </div>

      <nav className="nav">
        {nav.map((item) => (
          <button
            key={item.id}
            className={`nav-item${item.id === active ? ' active' : ''}`}
            onClick={() => onNavigate?.(item.id)}
          >
            <Icon name={item.icon} size={18} s={item.id === active ? 1.8 : 1.7} />
            <span>{item.label}</span>
            {item.id === 'tasks' && dueCount > 0 ? <span className="nav-badge">{dueCount}</span> : null}
          </button>
        ))}
      </nav>

        {tank ? (
          <div className="tank-card">
            <div className="eyebrow">Current tank</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginTop: 5, lineHeight: 1.3 }}>
              {tank.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 2 }}>{tank.volume_gal} gal</div>
          </div>
        ) : null}
      </aside>
    </>
  )
}
