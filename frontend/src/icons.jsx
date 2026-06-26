// Inline SVG icons, lifted from the mockup. `s` = stroke width.
// All inherit `currentColor` so they take the color of their container.

const base = (children, { size = 18, s = 1.7, fill = 'none' } = {}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={s}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

export const Drop = (p) => base(<path d="M12 3.4c3.6 4.6 5.5 7.4 5.5 10.1a5.5 5.5 0 0 1-11 0C6.5 10.8 8.4 8 12 3.4z" />, p)
export const Home = (p) => base(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>, p)
export const Chart = (p) => base(<><path d="M4 5v14h16" /><path d="M8 14l3-3 2 2 4-5" /></>, p)
export const List = (p) => base(<><path d="M5 7h14" /><path d="M5 12h14" /><path d="M5 17h9" /></>, p)
export const Grid = (p) =>
  base(
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>,
    p
  )
export const Book = (p) =>
  base(<><path d="M5 4h12a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5z" /><path d="M9 8h6M9 12h6" /></>, p)
export const Box = (p) =>
  base(<><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>, p)
export const Gear = (p) =>
  base(
    <>
      <path d="M5 7h14M5 12h14M5 17h14" />
      <circle cx="9" cy="7" r="2" fill="var(--card)" />
      <circle cx="15" cy="12" r="2" fill="var(--card)" />
      <circle cx="8" cy="17" r="2" fill="var(--card)" />
    </>,
    p
  )
export const Flask = (p) => base(<path d="M9 3h6M10 3v5l-4 9a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-4-9V3" />, p)
export const Cup = (p) => base(<><path d="M5 8h14l-1.5 11h-11z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>, p)
export const Wrench = (p) =>
  base(
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L4 16.7 7.3 20l5.3-5.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.1-.5-.5-2.1z" />,
    p
  )
export const Plus = (p) => base(<path d="M12 5v14M5 12h14" />, { ...p, s: p?.s ?? 2.2 })
export const Pulse = (p) => base(<path d="M3 12h4l2 5 4-12 2 7h6" />, { ...p, s: p?.s ?? 1.8 })
export const Clock = (p) =>
  base(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, { ...p, s: p?.s ?? 1.8 })
export const Info = (p) =>
  base(<><circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8h.01" /></>, { ...p, s: p?.s ?? 2 })
export const Check = (p) => base(<path d="M5 12l5 5 9-11" />, { ...p, s: p?.s ?? 3 })
export const Bell = (p) =>
  base(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>, p)
export const Calendar = (p) =>
  base(
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </>,
    p
  )
export const Wide = (p) =>
  base(<><path d="M9 8l-4 4 4 4M15 8l4 4-4 4" /><path d="M5 12h14" /></>, { ...p, s: p?.s ?? 2 })
export const ChevUp = (p) => base(<path d="M6 15l6-6 6 6" />, { ...p, s: p?.s ?? 2.2 })
export const ChevDown = (p) => base(<path d="M6 9l6 6 6-6" />, { ...p, s: p?.s ?? 2.2 })
export const X = (p) => base(<path d="M6 6l12 12M18 6L6 18" />, { ...p, s: p?.s ?? 2.2 })
export const Clipboard = (p) =>
  base(
    <>
      <rect x="5" y="4" width="14" height="17" rx="2.5" />
      <path d="M9 4.5a2 2 0 0 1 2-1.5h2a2 2 0 0 1 2 1.5V6H9z" />
      <path d="M9 11l1.5 1.5L13 10M9 16l1.5 1.5L13 15" />
    </>,
    p
  )
