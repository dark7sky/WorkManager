import { useEffect, useState } from 'react'

export const isOnlineNow = () => typeof navigator === 'undefined' || navigator.onLine !== false

export function useOnlineStatus() {
  const [online, setOnline] = useState(isOnlineNow)
  useEffect(() => {
    const setTrue = () => setOnline(true)
    const setFalse = () => setOnline(false)
    window.addEventListener('online', setTrue)
    window.addEventListener('offline', setFalse)
    return () => { window.removeEventListener('online', setTrue); window.removeEventListener('offline', setFalse) }
  }, [])
  return online
}
