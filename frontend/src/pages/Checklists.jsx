import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, ChevUp, ChevDown, X, Check, Clipboard } from '../icons.jsx'
import { Icon } from '../iconMap.jsx'
import { useTank } from '../TankContext.jsx'
import { api, CHECKLIST_CATEGORIES, CHECKLIST_STEP_KINDS, STEP_KIND_LABELS, CATEGORY_ICON, agoLabel } from '../api.js'

const BLANK_STEP = { text: '', detail: '', kind: 'note', config: {} }
const blankTemplate = () => ({ name: '', category: 'maintenance', description: '', steps: [{ ...BLANK_STEP }] })

// In-progress runs with critical steps still unchecked — the safety guard.
// Returns [{ run, steps: [text, ...] }].
export function criticalUndone(runs) {
  const out = []
  for (const r of runs || []) {
    const done = r.state?.done || {}
    const steps = (r.steps || []).filter((s) => s.kind === 'critical' && !done[s.id]).map((s) => s.text)
    if (steps.length) out.push({ run: r, steps })
  }
  return out
}

// ---- List view: template cards + resume in-progress runs ----

function TemplateCard({ t, onStart, onEdit, busy }) {
  return (
    <div className="card cl-card">
      <div className="cl-card-head">
        <div className="due-icon" style={{ background: 'var(--blueS)', color: 'var(--blue)' }}>
          <Icon name={CATEGORY_ICON[t.category] || 'clipboard'} size={16} s={1.8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cl-name">{t.name}</div>
          <div className="task-meta">{t.steps.length} step{t.steps.length === 1 ? '' : 's'}{t.category ? ` · ${t.category}` : ''}</div>
        </div>
      </div>
      {t.description ? <div className="cl-desc">{t.description}</div> : null}
      <div className="cl-card-actions">
        <button className="pill-btn active" disabled={busy} onClick={() => onStart(t)}>Start</button>
        <button className="pill-btn" disabled={busy} onClick={() => onEdit(t)}>Edit</button>
      </div>
    </div>
  )
}

// ---- Editor view ----

function Editor({ initial, parameters, onSave, onCancel, onDelete, busy }) {
  const [form, setForm] = useState(initial)
  const isNew = !initial.id

  const setStep = (i, patch) =>
    setForm((f) => ({ ...f, steps: f.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) }))
  const setStepConfig = (i, patch) =>
    setForm((f) => ({ ...f, steps: f.steps.map((s, k) => (k === i ? { ...s, config: { ...(s.config || {}), ...patch } } : s)) }))
  const addStep = () => setForm((f) => ({ ...f, steps: [...f.steps, { ...BLANK_STEP }] }))
  const removeStep = (i) => setForm((f) => ({ ...f, steps: f.steps.filter((_, k) => k !== i) }))
  const moveStep = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= form.steps.length) return
    setForm((f) => {
      const steps = [...f.steps]
      ;[steps[i], steps[j]] = [steps[j], steps[i]]
      return { ...f, steps }
    })
  }

  const cleanSteps = form.steps.filter((s) => s.text.trim())
  const canSave = form.name.trim() && cleanSteps.length > 0

  return (
    <div className="cl-editor">
      <div className="cl-edit-row">
        <input
          className="mini-input name"
          placeholder="Procedure name (e.g. Water Change)"
          value={form.name}
          autoFocus
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <select className="recur-select" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
          {CHECKLIST_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <textarea
        className="textarea-input"
        placeholder="What this procedure is for — a line of context in your own words (optional)."
        rows={2}
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
      />

      <div className="cl-steps-label">Steps</div>
      <div className="cl-step-edit-list">
        {form.steps.map((s, i) => (
          <div className="cl-step-edit" key={i}>
            <div className="cl-step-num">{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                className="mini-input"
                placeholder="Step"
                value={s.text}
                onChange={(e) => setStep(i, { text: e.target.value })}
              />
              <input
                className="mini-input cl-detail-input"
                placeholder="Detail / why (optional)"
                value={s.detail}
                onChange={(e) => setStep(i, { detail: e.target.value })}
              />
              <div className="cl-kind-row">
                <select
                  className={`recur-select cl-kind-select kind-${s.kind || 'note'}`}
                  value={s.kind || 'note'}
                  onChange={(e) => setStep(i, { kind: e.target.value, config: {} })}
                  title="Step type"
                >
                  {CHECKLIST_STEP_KINDS.map((k) => (
                    <option key={k} value={k}>{STEP_KIND_LABELS[k]}</option>
                  ))}
                </select>
                {s.kind === 'wait' ? (
                  <span className="cl-kind-cfg">
                    wait
                    <input
                      className="mini-input"
                      style={{ width: 56 }}
                      type="number"
                      min="0"
                      value={s.config?.hours ?? 24}
                      onChange={(e) => setStepConfig(i, { hours: Number(e.target.value) })}
                    />
                    hours
                  </span>
                ) : null}
                {s.kind === 'input' ? (
                  <span className="cl-kind-cfg">
                    <select
                      className="recur-select"
                      value={s.config?.target || 'journal'}
                      onChange={(e) => setStep(i, { config: e.target.value === 'reading' ? { target: 'reading', parameter_id: parameters?.[0]?.id } : { target: 'journal' } })}
                    >
                      <option value="journal">→ Journal</option>
                      <option value="reading">→ Reading</option>
                    </select>
                    {s.config?.target === 'reading' ? (
                      <select
                        className="recur-select"
                        value={s.config?.parameter_id ?? ''}
                        onChange={(e) => setStepConfig(i, { parameter_id: Number(e.target.value) })}
                      >
                        {(parameters || []).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    ) : null}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="cl-step-tools">
              <button className="icon-btn" onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="Move up"><ChevUp size={14} /></button>
              <button className="icon-btn" onClick={() => moveStep(i, 1)} disabled={i === form.steps.length - 1} aria-label="Move down"><ChevDown size={14} /></button>
              <button className="icon-btn" onClick={() => removeStep(i)} disabled={form.steps.length === 1} aria-label="Remove step"><X size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      <button className="ghost-btn" onClick={addStep}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <Plus size={15} s={2.2} /> Add step
        </span>
      </button>

      <div className="cl-editor-foot">
        <button className="save-btn" disabled={busy || !canSave} onClick={() => onSave({ ...form, steps: cleanSteps })}>
          {isNew ? 'Create checklist' : 'Save changes'}
        </button>
        <button className="link-btn" style={{ color: 'var(--ink2)' }} disabled={busy} onClick={onCancel}>Cancel</button>
        {!isNew ? (
          <button className="link-btn" style={{ color: 'var(--coral)', marginLeft: 'auto' }} disabled={busy} onClick={() => onDelete(initial)}>
            Delete
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ---- Smart step kinds (Phase C) ----

// Readiness of a `wait` step given when its timer was started (stored in run state).
function waitStatus(step, waits) {
  const startedAt = waits?.[step.id]
  const hours = Number(step.config?.hours ?? 0)
  if (!startedAt) return { started: false, ready: false, label: `needs ${hours}h` }
  const remMs = hours * 3600000 - (Date.now() - new Date(startedAt).getTime())
  if (remMs <= 0) return { started: true, ready: true, label: 'ready ✓' }
  const remH = remMs / 3600000
  return { started: true, ready: false, label: remH >= 1 ? `~${Math.ceil(remH)}h to go` : `~${Math.ceil(remMs / 60000)}m to go` }
}

function KindBadge({ kind }) {
  if (kind === 'critical') return <span className="cl-badge critical">⚠ Critical</span>
  if (kind === 'wait') return <span className="cl-badge wait">⏱ Wait</span>
  if (kind === 'input') return <span className="cl-badge input">✎ Capture</span>
  return null
}

// Kind-specific controls shared by the compact rows and the guided card.
function StepExtras({ step, waits, inputs, parameters, finished, busy, onStartWait, onResetWait, onInput }) {
  if (step.kind === 'wait') {
    const w = waitStatus(step, waits)
    return (
      <div className="cl-extra">
        {!w.started ? (
          <button className="pill-btn" disabled={busy || finished} onClick={() => onStartWait(step.id)}>Start timer</button>
        ) : (
          <span className={`cl-wait-status${w.ready ? ' ready' : ''}`}>
            {w.label}
            {!finished ? (
              <button className="link-btn" style={{ color: 'var(--ink3)', padding: '0 0 0 8px' }} onClick={() => onResetWait(step.id)}>reset</button>
            ) : null}
          </span>
        )}
      </div>
    )
  }
  if (step.kind === 'input') {
    const reading = step.config?.target === 'reading'
    const p = reading ? (parameters || []).find((x) => x.id === step.config?.parameter_id) : null
    const dest = reading ? (p?.name || 'reading') : 'journal'
    const val = inputs?.[step.id] ?? ''
    if (finished) {
      return val ? <div className="cl-step-detail">Captured: {val}{p?.unit ? ` ${p.unit}` : ''} → {dest}</div> : null
    }
    return (
      <div className="cl-extra">
        <input
          className="mini-input"
          style={{ width: 120 }}
          type={reading ? 'number' : 'text'}
          placeholder={reading ? `value${p?.unit ? ` (${p.unit})` : ''}` : 'value to log'}
          value={val}
          onChange={(e) => onInput(step.id, e.target.value)}
        />
        <span className="cl-extra-hint">→ {dest} on finish</span>
      </div>
    )
  }
  return null
}

// ---- Run view: guided one-step mode ⇄ compact checklist ----

function RunView({ run, parameters, onMutate, onComplete, onExit, busy }) {
  const done = run.state?.done || {}
  const notes = run.state?.notes || {}
  const waits = run.state?.waits || {}
  const inputs = run.state?.inputs || {}
  const doneCount = run.steps.filter((s) => done[s.id]).length
  const finished = run.status === 'completed'

  const [mode, setMode] = useState('compact') // 'compact' | 'guided'
  const [idx, setIdx] = useState(0)
  const cur = Math.min(idx, run.steps.length - 1) // clamp if step count shifts

  // Mutations are described as functions of the latest state (resolved by the
  // parent against a ref) so rapid toggles / note edits never clobber each other.
  const setDone = (id, value) =>
    onMutate((st) => {
      const d = { ...(st.done || {}) }
      if (value) d[id] = true
      else delete d[id]
      return { ...st, done: d }
    })
  const toggle = (id) => setDone(id, !done[id])
  const setNote = (id, val) =>
    onMutate((st) => ({ ...st, notes: { ...(st.notes || {}), [id]: val } }))
  const startWait = (id) =>
    onMutate((st) => ({ ...st, waits: { ...(st.waits || {}), [id]: new Date().toISOString() } }))
  const resetWait = (id) =>
    onMutate((st) => { const w = { ...(st.waits || {}) }; delete w[id]; return { ...st, waits: w } })
  const setInput = (id, val) =>
    onMutate((st) => ({ ...st, inputs: { ...(st.inputs || {}), [id]: val } }))

  const extrasProps = { waits, inputs, parameters, finished, busy, onStartWait: startWait, onResetWait: resetWait, onInput: setInput }

  // Enter guided mode at the first not-yet-done step.
  const enterGuided = () => {
    const first = run.steps.findIndex((s) => !done[s.id])
    setIdx(first === -1 ? 0 : first)
    setMode('guided')
  }

  // Big primary action: mark the current step done, then advance (or finish).
  const doneAndNext = () => {
    const s = run.steps[cur]
    if (!done[s.id]) setDone(s.id, true)
    if (cur < run.steps.length - 1) setIdx(cur + 1)
    else onComplete()
  }

  const ModeToggle = !finished ? (
    <div className="pill-row" style={{ margin: 0 }}>
      <button className={`pill-btn${mode === 'guided' ? ' active' : ''}`} onClick={enterGuided}>Guided</button>
      <button className={`pill-btn${mode === 'compact' ? ' active' : ''}`} onClick={() => setMode('compact')}>Checklist</button>
    </div>
  ) : null

  return (
    <div className="cl-run">
      <div className="cl-run-head">
        <button className="link-btn" style={{ color: 'var(--ink2)' }} onClick={onExit}>← Back</button>
        <div style={{ flex: 1 }} />
        {ModeToggle}
        <span className="due-badge" style={{ color: 'var(--ink2)', background: 'var(--card2)', marginLeft: 8 }}>
          {doneCount}/{run.steps.length}
        </span>
      </div>
      <div className="cl-run-title">{run.template_name}</div>
      {finished ? (
        <div className="cl-done-banner">Done — finished {agoLabel(run.completed_at)}. Nice work.</div>
      ) : null}

      {mode === 'guided' && !finished ? (
        <GuidedStep
          step={run.steps[cur]}
          index={cur}
          total={run.steps.length}
          isDone={!!done[run.steps[cur].id]}
          note={notes[run.steps[cur].id] || ''}
          busy={busy}
          extrasProps={extrasProps}
          onNote={(v) => setNote(run.steps[cur].id, v)}
          onToggle={() => toggle(run.steps[cur].id)}
          onBack={() => setIdx(Math.max(0, cur - 1))}
          onSkip={() => (cur < run.steps.length - 1 ? setIdx(cur + 1) : onComplete())}
          onPrimary={doneAndNext}
        />
      ) : (
        <>
          <div className="cl-step-list">
            {run.steps.map((s, i) => {
              const isDone = !!done[s.id]
              return (
                <div className={`cl-step${isDone ? ' done' : ''}${s.kind === 'critical' ? ' critical' : ''}`} key={s.id}>
                  <button
                    className={`task-check${isDone ? ' done' : ''}`}
                    disabled={busy || finished}
                    onClick={() => toggle(s.id)}
                    aria-label={isDone ? 'Completed' : 'Mark step done'}
                  >
                    {isDone ? <Check size={13} s={3} /> : null}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={`cl-step-text${isDone ? ' done' : ''}`}>
                      <span className="cl-step-i">{i + 1}.</span> {s.text}
                      {s.kind !== 'note' ? <KindBadge kind={s.kind} /> : null}
                    </div>
                    {s.detail ? <div className="cl-step-detail">{s.detail}</div> : null}
                    <StepExtras step={s} {...extrasProps} />
                    {!finished ? (
                      <input
                        className="mini-input cl-note-input"
                        placeholder="Add a note (optional)"
                        value={notes[s.id] || ''}
                        onChange={(e) => setNote(s.id, e.target.value)}
                      />
                    ) : notes[s.id] ? (
                      <div className="cl-step-detail" style={{ fontStyle: 'italic' }}>Note: {notes[s.id]}</div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          {!finished ? (
            <div className="cl-editor-foot">
              <button className="save-btn" disabled={busy} onClick={onComplete}>
                {doneCount < run.steps.length ? `Finish (${run.steps.length - doneCount} unchecked)` : 'Finish'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

// One big step at a time — good for wet hands mid-water-change.
function GuidedStep({ step, index, total, isDone, note, busy, extrasProps, onNote, onToggle, onBack, onSkip, onPrimary }) {
  const last = index === total - 1
  return (
    <div className="cl-guided">
      <div className="cl-guided-progress">Step {index + 1} of {total}</div>
      <div className={`cl-guided-card${isDone ? ' done' : ''}${step.kind === 'critical' ? ' critical' : ''}`}>
        <button
          className={`task-check big${isDone ? ' done' : ''}`}
          disabled={busy}
          onClick={onToggle}
          aria-label={isDone ? 'Mark not done' : 'Mark done'}
        >
          {isDone ? <Check size={20} s={3} /> : null}
        </button>
        {step.kind !== 'note' ? <div style={{ marginBottom: 8 }}><KindBadge kind={step.kind} /></div> : null}
        <div className="cl-guided-text">{step.text}</div>
        {step.detail ? <div className="cl-guided-detail">{step.detail}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
          <StepExtras step={step} {...extrasProps} />
        </div>
        <input
          className="mini-input cl-note-input"
          style={{ marginTop: 12 }}
          placeholder="Add a note (optional)"
          value={note}
          onChange={(e) => onNote(e.target.value)}
        />
      </div>
      <div className="cl-guided-nav">
        <button className="pill-btn" disabled={busy || index === 0} onClick={onBack}>← Back</button>
        <button className="link-btn" style={{ color: 'var(--ink3)' }} disabled={busy} onClick={onSkip}>Skip</button>
        <button className="save-btn cl-guided-primary" disabled={busy} onClick={onPrimary}>
          {last ? 'Finish ✓' : 'Done & next →'}
        </button>
      </div>
    </div>
  )
}

// ---- Page ----

export default function Checklists({ navArg, onNavigate }) {
  const { tank, parameters, refreshTasks } = useTank()
  const [templates, setTemplates] = useState(null)
  const [runs, setRuns] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  // mode: 'list' | 'edit' | 'run'
  const [editing, setEditing] = useState(null) // template object or blank when in edit mode
  const [run, setRun] = useState(null)
  // Mirror of `run` kept in a ref so successive state mutations within one tick
  // (e.g. two quick checkbox taps) each build on the latest value, not a stale closure.
  const runRef = useRef(null)
  const applyRun = useCallback((r) => {
    runRef.current = r
    setRun(r)
  }, [])
  // Serialize state writes: each whole-state PATCH waits for the previous one, so
  // rapid mutations land in call order (last write = latest cumulative state) and
  // can't race to a stale last-write-wins result.
  const saveChain = useRef(Promise.resolve())

  const load = useCallback(async () => {
    if (!tank) return
    try {
      const [t, r] = await Promise.all([api.listChecklists(tank.id), api.listRuns(tank.id, 'in_progress')])
      setTemplates(t)
      setRuns(r)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [tank])

  useEffect(() => { load() }, [load])

  // Open a specific run when navigated here with one (from a task's "Run" action
  // or the dashboard widget). Consume each runId once so re-renders don't reopen it.
  const consumedNav = useRef(null)
  useEffect(() => {
    if (templates && navArg?.runId && consumedNav.current !== navArg.runId) {
      consumedNav.current = navArg.runId
      resumeRun(navArg.runId)
    }
  }, [navArg, templates])

  async function startRun(t) {
    setBusy(true)
    try {
      applyRun(await api.startRun(t.id))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function resumeRun(runId) {
    setBusy(true)
    try {
      applyRun(await api.getRun(runId))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Apply a state mutation (function of the latest state) optimistically, then
  // persist. Reads/writes runRef so back-to-back mutations don't clobber.
  function mutateState(mut) {
    const r = runRef.current
    if (!r) return
    const state = mut(r.state || {})
    applyRun({ ...r, state })
    saveChain.current = saveChain.current
      .catch(() => {})
      .then(() => api.updateRunState(r.id, state).catch((e) => setError(e.message)))
  }

  async function completeRun() {
    setBusy(true)
    try {
      await saveChain.current.catch(() => {})  // flush pending state writes first
      const finished = await api.completeRun(runRef.current.id)
      applyRun(finished)
      await load()
      // A task-linked run reschedules its task server-side — refresh shared task state.
      if (finished.task_id) refreshTasks()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveTemplate(form) {
    setBusy(true)
    try {
      const body = {
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim(),
        steps: form.steps.map((s) => ({ text: s.text.trim(), detail: s.detail.trim(), kind: s.kind || 'note', config: s.config || {} })),
      }
      if (form.id) await api.updateChecklist(form.id, body)
      else await api.createChecklist({ tank_id: tank.id, ...body })
      setEditing(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteTemplate(t) {
    if (!window.confirm(`Delete “${t.name}”? This hides it; in-progress runs are unaffected.`)) return
    setBusy(true)
    try {
      await api.deleteChecklist(t.id)
      setEditing(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!tank || templates === null) return <div className="content">Loading…</div>

  return (
    <div className="content rtscroll">
      {error ? <div className="dash-save-error" style={{ marginBottom: 12 }}>Something went wrong: {error}</div> : null}

      {run ? (
        <RunView
          run={run}
          parameters={parameters}
          busy={busy}
          onMutate={mutateState}
          onComplete={completeRun}
          onExit={() => { applyRun(null); load() }}
        />
      ) : editing ? (
        <Editor
          initial={editing}
          parameters={parameters}
          busy={busy}
          onSave={saveTemplate}
          onCancel={() => setEditing(null)}
          onDelete={deleteTemplate}
        />
      ) : (
        <>
          {criticalUndone(runs).map(({ run: r, steps }) => (
            <button key={`warn-${r.id}`} className="cl-safety-warn" disabled={busy} onClick={() => resumeRun(r.id)}>
              <span className="cl-safety-icon">⚠</span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                <strong>{r.template_name}</strong> isn’t finished — still off/unchecked: {steps.join(', ')}. Did you turn everything back on? Tap to finish.
              </span>
            </button>
          ))}
          {runs.length ? (
            <div className="cl-resume">
              <div className="cl-steps-label">In progress</div>
              {runs.map((r) => (
                <button key={r.id} className="cl-resume-row" disabled={busy} onClick={() => resumeRun(r.id)}>
                  <Clipboard size={15} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{r.template_name}</span>
                  <span className="task-meta">started {agoLabel(r.started_at)} · resume →</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="cl-grid">
            {templates.map((t) => (
              <TemplateCard key={t.id} t={t} busy={busy} onStart={startRun} onEdit={(tpl) => setEditing(structuredClone(tpl))} />
            ))}
          </div>
          {templates.length === 0 ? (
            <div className="empty" style={{ marginBottom: 14 }}>No checklists yet — build your first procedure below.</div>
          ) : null}
          <button className="ghost-btn" onClick={() => setEditing(blankTemplate())}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              <Plus size={15} s={2.2} /> New checklist
            </span>
          </button>
        </>
      )}
    </div>
  )
}
