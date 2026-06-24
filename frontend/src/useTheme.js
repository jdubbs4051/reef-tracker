import { useEffect, useState } from 'react'

// Light/dark theme, persisted to localStorage. Sets data-theme on <html>,
// which the CSS variables in theme.css key off.
export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('rt-theme') || 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('rt-theme', theme)
  }, [theme])

  return [theme, setTheme]
}
