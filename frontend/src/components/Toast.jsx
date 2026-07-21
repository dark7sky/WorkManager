import { CheckCircle2, CircleAlert, X } from 'lucide-react'
export default function Toast({ toast, onClose }) {
  if (!toast) return null
  return <div className={`toast ${toast.type || 'success'}`} role={toast.type === 'error' ? 'alert' : 'status'} aria-live={toast.type === 'error' ? 'assertive' : 'polite'}>
    {toast.type === 'error' ? <CircleAlert/> : <CheckCircle2/>}<span>{toast.message}</span>
    {toast.action ? <button className="toast-action" onClick={() => { toast.action.onClick(); onClose() }}>{toast.action.label}</button> : null}
    <button onClick={onClose} aria-label="닫기"><X/></button>
  </div>
}
