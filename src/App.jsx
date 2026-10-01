import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import Docs from './pages/Docs.jsx'
import Workbench from './pages/Workbench.jsx'

const THEME_KEY = 'sukrim-theme'
// Renaming the product renamed this key. Reading the old one first means an
// existing user's choice survives the rename instead of silently reverting to
// whatever their system prefers.
const THEME_KEY_WAS = 'eli-theme'

function storedTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || localStorage.getItem(THEME_KEY_WAS)
  } catch {
    return null                                     // private window, or blocked
  }
}

function useTheme() {
  const [theme, setTheme] = useState(
    () => storedTheme() ||
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
      localStorage.removeItem(THEME_KEY_WAS)
    } catch { /* private window */ }
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}

export default function App() {
  const [theme, toggle] = useTheme()
  // The landing page carries the design's own sticky nav, wordmark and scroll
  // progress bar. Rendering the app chrome above it would stack two headers.
  // The workbench, likewise, carries the design's own top bar.
  const { pathname } = useLocation()
  const ownChrome = pathname === '/' || pathname === '/workbench'
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      {!ownChrome && <header className="nav">
        <div className="page nav-inner">
          <Link to="/" className="brand">Sukrim<span className="brand-dot">.</span></Link>
          <nav className="nav-links">
            <NavLink to="/" end>Overview</NavLink>
            <NavLink to="/workbench">Workbench</NavLink>
            <NavLink to="/docs">Docs</NavLink>
            <button className="icon-btn" onClick={toggle}
                    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </nav>
        </div>
      </header>}
      <main id="main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/docs/*" element={<Docs />} />
          <Route path="/workbench" element={<Workbench />} />
          {/* /console was removed; a stale link lands on the overview
              rather than a blank page with a working nav above it. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}
