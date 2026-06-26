import { useEffect, useState } from 'react'
import { Check, Plus, Clipboard } from '../icons.jsx'
import { useTank } from '../TankContext.jsx'
import { api, CADENCES, CATEGORIES, dueInfo } from '../api.js'

const FILTERS = [
  ['all', 'All'],
  ['due', 'Due'],
  ['week', 'This week'],
]

function dueStyle(info, done) {
  if (done) return { color: 'var(--teal)', background: 'transparent' }
  if (info.urgent) return { color: 'var(--coral)', background: 'var(--coralS)' }
  return { color: 'var(--ink2)', background: 'var(--card2)' }
}

const BLANK = { name: '', category: 'maintenance', recurrence_rule: 'weekly', checklist_template_id: '' }

export default function Tasks({ onNavigate }) {
  const { tank, tasks, loading, error, refreshTasks } = useTank()
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  // Tasks just completed this session — kept visible (struck through) until you leave.
  const [justDone, setJustDone] = useState({})
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [templates, setTemplates] = useState([]) // checklist templates available to link

  useEffect(() => {
    if (!tank) return
    let cancelled = false
    api.listChecklists(tank.id).then((t) => { if (!cancelled) setTemplates(t) }).catch(() => {})
    return () => { cancelled = true }
  }, [tank])

  async function toggleDone(t) {
    setBusy(true)
    try {
      await api.completeTask(t.id)
      setJustDone((m) => ({ ...m, [t.id]: true }))
      await refreshTasks()
    } finally {
      setBusy(false)
    }
  }

  async function changeRecur(t, rule) {
    setBusy(true)
    try {
      await api.updateTask(t.id, { recurrence_rule: rule })
      await refreshTasks()
    } finally {
      setBusy(false)
    }
  }

  async function createTask() {
    if (!tank || !form.name.trim()) return
    setBusy(true)
    try {
      await api.createTask({
        tank_id: tank.id,
        name: form.name.trim(),
        category: form.category,
        recurrence_rule: form.recurrence_rule,
        checklist_template_id: form.checklist_template_id ? Number(form.checklist_template_id) : null,
      })
      setForm(BLANK)
      setAdding(false)
      await refreshTasks()
    } finally {
      setBusy(false)
    }
  }

  // Link a task to a checklist template ('' clears the link).
  async function changeTemplate(t, value) {
    setBusy(true)
    try {
      await api.updateTask(t.id, { checklist_template_id: value ? Number(value) : null })
      await refreshTasks()
    } finally {
      setBusy(false)
    }
  }

  // Start a run of the task's linked procedure, then open it on the Checklists page.
  async function runFromTask(t) {
    setBusy(true)
    try {
      const run = await api.startRun(t.checklist_template_id, t.id)
      onNavigate?.('checklists', { runId: run.id })
    } catch (e) {
      setBusy(false) // stay put on error; otherwise we've navigated away
    }
  }

  async function removeTask(t) {
    if (!window.confirm(`Delete “${t.name}”? This hides it and stops its reminders.`)) return
    setBusy(true)
    try {
      await api.deleteTask(t.id)
      await refreshTasks()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="content">Loading…</div>
  if (error) return <div className="content" style={{ color: 'var(--coral)' }}>Couldn’t reach the API: {error}</div>

  const withInfo = tasks.map((t) => ({ t, info: dueInfo(t.next_due_at), done: !!justDone[t.id] }))
  const dueCount = withInfo.filter((x) => x.info.urgent && !x.done).length
  const shown = withInfo.filter(({ info }) => {
    if (filter === 'due') return info.urgent
    if (filter === 'week') return info.scheduled && info.days <= 7
    return true
  })

  return (
    <div className="content rtscroll">
      <div className="tasks-wrap">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Maintenance</div>
          {dueCount > 0 ? (
            <span className="due-badge" style={{ color: 'var(--coral)', background: 'var(--coralS)' }}>
              {dueCount} due
            </span>
          ) : (
            <span className="due-badge" style={{ color: 'var(--teal)', background: 'var(--tealS)' }}>
              All caught up
            </span>
          )}
        </div>

        <div className="filter-row">
          {FILTERS.map(([id, label]) => (
            <button key={id} className={`filter-btn${filter === id ? ' active' : ''}`} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="task-list">
          {shown.map(({ t, info, done }) => (
            <div className={`task-row${done ? ' done' : ''}`} key={t.id}>
              <button
                className={`task-check${done ? ' done' : info.urgent ? ' urgent' : ''}`}
                disabled={busy || done}
                onClick={() => toggleDone(t)}
                aria-label={done ? 'Completed' : 'Mark done'}
              >
                {done ? <Check size={13} s={3} /> : null}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={`task-name${done ? ' done' : ''}`}>{t.name}</div>
                <div className="task-meta">{t.category}</div>
              </div>
              {t.checklist_template_id ? (
                <button className="run-btn" disabled={busy} onClick={() => runFromTask(t)} title="Run the linked procedure">
                  <Clipboard size={13} /> Run
                </button>
              ) : null}
              <select
                className="recur-select"
                value={t.checklist_template_id || ''}
                disabled={busy}
                onChange={(e) => changeTemplate(t, e.target.value)}
                title="Link a checklist procedure"
              >
                <option value="">No checklist</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
              <select
                className="recur-select"
                value={CADENCES.includes(t.recurrence_rule) ? t.recurrence_rule : 'as needed'}
                disabled={busy}
                onChange={(e) => changeRecur(t, e.target.value)}
              >
                {CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <span className="due-badge" style={dueStyle(info, done)}>
                {done ? 'Done' : info.label}
              </span>
              <button className="icon-btn" disabled={busy} onClick={() => removeTask(t)} aria-label="Delete task" title="Delete">
                ×
              </button>
            </div>
          ))}
        </div>

        {adding ? (
          <div className="add-form">
            <input
              className="mini-input name"
              placeholder="Task name"
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && createTask()}
            />
            <select className="recur-select" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select className="recur-select" value={form.recurrence_rule} onChange={(e) => setForm((f) => ({ ...f, recurrence_rule: e.target.value }))}>
              {CADENCES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {templates.length ? (
              <select
                className="recur-select"
                value={form.checklist_template_id}
                onChange={(e) => setForm((f) => ({ ...f, checklist_template_id: e.target.value }))}
                title="Link a checklist procedure"
              >
                <option value="">No checklist</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button className="link-btn" style={{ color: 'var(--teal)' }} disabled={busy || !form.name.trim()} onClick={createTask}>
              Add
            </button>
            <button className="link-btn" style={{ color: 'var(--ink2)' }} disabled={busy} onClick={() => { setAdding(false); setForm(BLANK) }}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="ghost-btn" disabled={busy} onClick={() => setAdding(true)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              <Plus size={15} s={2.2} /> New task
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
