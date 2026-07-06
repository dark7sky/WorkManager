import { CheckCircle2, CircleAlert, X } from 'lucide-react'
export default function Toast({ toast, onClose }) {
  if (!toast) return null
  return <div className={`toast ${toast.type || 'success'}`} role="status">
    {toast.type === 'error' ? <CircleAlert/> : <CheckCircle2/>}<span>{toast.message}</span>
    <button onClick={onClose} aria-label="닫기"><X/></button>
  </div>
}
