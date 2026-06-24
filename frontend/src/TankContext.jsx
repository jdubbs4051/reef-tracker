import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api.js'

const TankContext = createContext(null)

// Loads the active tank and its parameters once, exposing a refresh() so screens
// that edit parameters (Settings) or log readings can re-pull shared state.
export function TankProvider({ children }) {
  const [tank, setTank] = useState(null)
  const [parameters, setParameters] = useState([])
  const [tasks, setTasks] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const tanks = await api.listTanks()
      const t = tanks[0] || null
      setTank(t)
      if (t) {
        const [params, ts] = await Promise.all([api.listParameters(t.id), api.listTasks(t.id)])
        setParameters(params)
        setTasks(ts)
      } else {
        setParameters([])
        setTasks([])
      }
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-pull just the task list (after mark-done / edit) without a full reload flash.
  const refreshTasks = useCallback(async () => {
    if (tank) setTasks(await api.listTasks(tank.id))
  }, [tank])

  useEffect(() => {
    load()
  }, [load])

  return (
    <TankContext.Provider value={{ tank, parameters, tasks, loading, error, refresh: load, refreshTasks }}>
      {children}
    </TankContext.Provider>
  )
}

export function useTank() {
  const ctx = useContext(TankContext)
  if (!ctx) throw new Error('useTank must be used within TankProvider')
  return ctx
}
