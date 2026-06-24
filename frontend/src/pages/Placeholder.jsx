// Stub for screens that arrive in later phases (Tasks, Livestock, Journal, Consumables).
export default function Placeholder({ screen }) {
  return (
    <div className="content">
      <div
        className="card"
        style={{ maxWidth: 520, textAlign: 'center', padding: '40px 24px', color: 'var(--ink2)' }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginBottom: 6, textTransform: 'capitalize' }}>
          {screen}
        </div>
        <div style={{ fontSize: 13 }}>This screen is part of a later build phase — not in Phase 1.</div>
      </div>
    </div>
  )
}
