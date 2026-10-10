import { useState } from 'react'

const KEY = 'sv-theme'
const THEMES = ['light', 'dark', 'bw']
const DEFAULT_LABELS = { light: 'Light', dark: 'Dark', bw: 'B&W' }

function readSaved() {
  try {
    const t = localStorage.getItem(KEY)
    return THEMES.includes(t) ? t : 'light'
  } catch { return 'light' }
}

function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'light') delete root.dataset.theme
  else root.dataset.theme = theme
}

export function initTheme() {
  applyTheme(readSaved())
}

export default function ThemeToggle({ labels }) {
  const [theme, setTheme] = useState(readSaved)
  const text = { ...DEFAULT_LABELS, ...labels }

  const choose = (t) => {
    setTheme(t)
    applyTheme(t)
    try { localStorage.setItem(KEY, t) } catch { /* storage unavailable */ }
    window.dispatchEvent(new CustomEvent('themechange', { detail: t }))
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {THEMES.map((t) => (
        <button key={t} type="button" className={`theme-toggle-btn${theme === t ? ' active' : ''}`} aria-pressed={theme === t} onClick={() => choose(t)}>
          {text[t]}
        </button>
      ))}
    </div>
  )
}
