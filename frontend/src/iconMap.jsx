import { Drop, Home, Chart, List, Grid, Book, Box, Gear, Flask, Cup, Wrench, Calendar, Clipboard } from './icons.jsx'

// Resolve a string key from data.js to an icon component.
export const ICONS = {
  drop: Drop,
  home: Home,
  chart: Chart,
  list: List,
  grid: Grid,
  book: Book,
  box: Box,
  gear: Gear,
  flask: Flask,
  cup: Cup,
  wrench: Wrench,
  calendar: Calendar,
  clipboard: Clipboard,
}

export function Icon({ name, ...props }) {
  const C = ICONS[name]
  return C ? <C {...props} /> : null
}
