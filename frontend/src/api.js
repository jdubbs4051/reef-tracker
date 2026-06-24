// Thin API client for the Reef Tracker backend. All URLs are relative so the
// same build works behind the Vite dev proxy and same-origin in Docker.

async function req(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status} ${path}: ${text}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  listTanks: () => req('/tanks'),
  listParameters: (tankId, includeInactive = false) =>
    req(`/parameters?tank_id=${tankId}&include_inactive=${includeInactive}`),
  createParameter: (body) => req('/parameters', { method: 'POST', body: JSON.stringify(body) }),
  updateParameter: (id, body) =>
    req(`/parameters/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deactivateParameter: (id) => req(`/parameters/${id}`, { method: 'DELETE' }),

  latestReadings: (tankId) => req(`/readings/latest?tank_id=${tankId}`),
  listReadings: (tankId) => req(`/readings?tank_id=${tankId}`),
  createReadings: (body) => req('/readings', { method: 'POST', body: JSON.stringify(body) }),
  series: (tankId, parameterId, weeks = 8) =>
    req(`/readings/series?tank_id=${tankId}&parameter_id=${parameterId}&weeks=${weeks}`),
  seriesAll: (tankId, weeks = 8) => req(`/readings/series-all?tank_id=${tankId}&weeks=${weeks}`),

  listTasks: (tankId) => req(`/tasks?tank_id=${tankId}`),
  createTask: (body) => req('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id, body) => req(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  completeTask: (id, body = {}) => req(`/tasks/${id}/complete`, { method: 'POST', body: JSON.stringify(body) }),
  deleteTask: (id) => req(`/tasks/${id}`, { method: 'DELETE' }),
  notificationsStatus: () => req('/notifications/status'),
  getNotificationSettings: () => req('/notifications/settings'),
  saveNotificationSettings: (body) =>
    req('/notifications/settings', { method: 'PUT', body: JSON.stringify(body) }),
  testNotification: () => req('/notifications/test', { method: 'POST' }),
  activity: (tankId, limit = 6) => req(`/activity?tank_id=${tankId}&limit=${limit}`),

  getDashboardLayout: (tankId) => req(`/dashboard/layout?tank_id=${tankId}`),
  saveDashboardLayout: (tankId, widgets) =>
    req(`/dashboard/layout?tank_id=${tankId}`, { method: 'PUT', body: JSON.stringify({ widgets }) }),

  listLivestock: (tankId, type) =>
    req(`/livestock?tank_id=${tankId}${type ? `&type=${type}` : ''}`),
  createLivestock: (body) => req('/livestock', { method: 'POST', body: JSON.stringify(body) }),
  updateLivestock: (id, body) => req(`/livestock/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLivestock: (id) => req(`/livestock/${id}`, { method: 'DELETE' }),
  stockingAdvice: (tankId, type, commonName) =>
    req(`/livestock/advice?tank_id=${tankId}&type=${type}&common_name=${encodeURIComponent(commonName)}`),

  listEquipment: (tankId, type) =>
    req(`/equipment?tank_id=${tankId}${type ? `&type=${encodeURIComponent(type)}` : ''}`),
  createEquipment: (body) => req('/equipment', { method: 'POST', body: JSON.stringify(body) }),
  updateEquipment: (id, body) => req(`/equipment/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEquipment: (id) => req(`/equipment/${id}`, { method: 'DELETE' }),

  listJournal: (tankId) => req(`/journal?tank_id=${tankId}`),
  createJournal: (body) => req('/journal', { method: 'POST', body: JSON.stringify(body) }),
  deleteJournal: (id) => req(`/journal/${id}`, { method: 'DELETE' }),

  // Photo upload is multipart, so it bypasses the JSON helper.
  uploadPhoto: async (form) => {
    const res = await fetch('/api/photos', { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Upload failed (${res.status})`)
    return res.json()
  },
}

export const LIVESTOCK_TYPES = ['fish', 'coral', 'invert', 'cuc']

// Reef-appropriate equipment types (mirror backend schemas.EQUIPMENT_TYPES).
export const EQUIPMENT_TYPES = [
  'Lighting',
  'Return pump',
  'Powerhead / wavemaker',
  'Protein skimmer',
  'Heater',
  'ATO',
  'Doser',
  'Filtration / media reactor',
  'Controller',
  'UV sterilizer',
  'Chiller / fan',
  'RODI system',
  'Other',
]

// Task categories offered when creating a task (drive the icon + iCal category).
export const CATEGORIES = ['water', 'testing', 'filtration', 'media', 'maintenance']

// Cadences offered in the Tasks editor (mirror backend recurrence.CADENCES).
export const CADENCES = ['daily', 'weekly', 'biweekly', 'monthly', 'as needed']

// Map a task category to an icon key (see iconMap.jsx).
export const CATEGORY_ICON = {
  water: 'drop',
  testing: 'flask',
  filtration: 'cup',
  media: 'box',
  maintenance: 'list',
}

// Due-date classification from an ISO timestamp, compared by calendar day (local).
export function dueInfo(iso) {
  if (!iso) return { label: 'As needed', days: Infinity, urgent: false, scheduled: false }
  const due = new Date(iso)
  const now = new Date()
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d1 = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const days = Math.round((d1 - d0) / 86400000)
  const label = days < 0 ? 'Overdue' : days === 0 ? 'Today' : `${days}d`
  return { label, days, urgent: days <= 0, scheduled: true }
}

// Past relative-day label for the activity feed: "Today" / "Yesterday" / "3d ago" / "Jun 14".
export function agoLabel(iso) {
  if (!iso) return ''
  const at = new Date(iso)
  const now = new Date()
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d1 = new Date(at.getFullYear(), at.getMonth(), at.getDate())
  const days = Math.round((d0 - d1) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// --- shared helpers ---

// Out-of-range classification, used for dots and labels everywhere.
export function statusFor(value, p) {
  if (value == null) return 'none'
  if (p.target_max != null && value > p.target_max) return 'high'
  if (p.target_min != null && value < p.target_min) return 'low'
  return 'ok'
}

// JS drops trailing .0 already, so String() gives "77" / "1.025" / "8.4".
export const fmt = (n) => (n == null ? '—' : String(n))

export function rangeText(p) {
  if (p.target_min == null && p.target_max == null) return ''
  return `${fmt(p.target_min)}–${fmt(p.target_max)}`
}
