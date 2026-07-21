import { useMemo, useState } from 'react'
import { CheckSquare, Calendar, ListTodo, NotebookPen } from 'lucide-react'
import Modal from './Modal'
import { globalSearchResultCount, searchAll } from '../globalSearch.js'

const groups = [
  { key: 'tasks', label: '업무', Icon: CheckSquare },
  { key: 'events', label: '일정', Icon: Calendar },
  { key: 'todos', label: '할 일', Icon: ListTodo },
  { key: 'logs', label: '업무 기록', Icon: NotebookPen },
]

export default function GlobalSearch({ open, onClose, data, onOpenTask, onOpenTodo, onOpenLog, onOpenEvent }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchAll(data, query), [data, query])
  const count = globalSearchResultCount(results)
  if (!open) return null
  const openers = { tasks: onOpenTask, events: onOpenEvent, todos: onOpenTodo, logs: onOpenLog }
  const labelOf = { tasks: t => t.title, events: e => e.title, todos: t => t.title, logs: l => l.content }
  return <Modal title="전체 검색" onClose={onClose}>
    <div className="global-search">
      <input type="search" autoFocus placeholder="업무, 일정, 할 일, 업무 기록 검색…" aria-label="전체 검색"
        value={query} onChange={e => setQuery(e.target.value)}/>
      {query.trim() && !count ? <p className="global-search-empty">검색 결과가 없습니다.</p> : null}
      {groups.map(({ key, label, Icon }) => (results[key]?.length ? <div className="global-search-group" key={key}>
        <h3><Icon size={14} aria-hidden="true"/>{label}</h3>
        <ul>{results[key].map(item => <li key={item.id}>
          <button type="button" onClick={() => { openers[key]?.(item); onClose() }}>{labelOf[key](item)}</button>
        </li>)}</ul>
      </div> : null))}
    </div>
  </Modal>
}
