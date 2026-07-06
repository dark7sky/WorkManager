import { X } from 'lucide-react'
export default function Modal({ title, children, onClose }) { return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="modal"><header className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose}><X/></button></header>{children}</section></div> }
