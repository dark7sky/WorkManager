import { Bell, Menu, Plus } from 'lucide-react'

export default function Header({ title, subtitle, action, onAction }) {
  return <header className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="header-actions"><button className="icon-button"><Bell size={19}/></button>{action ? <button className="primary" onClick={onAction}><Plus size={18}/>{action}</button> : null}</div></header>
}
