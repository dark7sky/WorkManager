import { useEffect, useState } from 'react'

const KEY = 'wm-theme-v1'
export function useTheme() {
  const [preference, setPreference] = useState(() => localStorage.getItem(KEY) || 'auto')
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  const resolved = preference === 'auto' ? (systemDark ? 'dark' : 'light') : preference
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const change = event => setSystemDark(event.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
    localStorage.setItem(KEY, preference)
  }, [preference, resolved])
  return { preference, setPreference, resolved }
}
