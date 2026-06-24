// Static navigation model. Everything else on the dashboard is now live from the API
// (readings, chart, tasks, activity, tank-status insight).

export const nav = [
  { id: 'home', label: 'Dashboard', icon: 'home' },
  { id: 'log', label: 'Parameter Tracking', icon: 'drop' },
  { id: 'charts', label: 'Historic Trends', icon: 'chart' },
  { id: 'tasks', label: 'Tasks', icon: 'list' },
  { id: 'livestock', label: 'Livestock', icon: 'grid' },
  { id: 'journal', label: 'Journal', icon: 'book' },
  { id: 'equipment', label: 'Equipment', icon: 'wrench' },
  { id: 'consumables', label: 'Consumables', icon: 'box' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
]
