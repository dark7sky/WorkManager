import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [activeIndex, setActiveIndex] = useState(-1)
  const results = useMemo(() => searchAll(data, query), [data, query])
  const count = globalSearchResultCount(results)
  const openers = { tasks: onOpenTask, events: onOpenEvent, todos: onOpenTodo, logs: onOpenLog }
  const labelOf = { tasks: t => t.title, events: e => e.title, todos: t => t.title, logs: l => l.content }
  const flatItems = useMemo(() => groups.flatMap(({ key }) => (results[key] || []).map(item => ({ key, item }))), [results])
  const buttonRefs = useRef([])
  buttonRefs.current = []
  useEffect(() => { setActiveIndex(-1) }, [query])
  useEffect(() => {
    if (activeIndex >= 0) buttonRefs.current[activeIndex]?.focus()
  }, [activeIndex])
  if (!open) return null
  const moveActive = delta => {
    if (!flatItems.length) return
    setActiveIndex(i => {
      const next = i < 0 ? (delta > 0 ? 0 : flatItems.length - 1) : Math.min(Math.max(i + delta, 0), flatItems.length - 1)
      return next
    })
  }
  const onKeyDown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1) }
  }
  return <Modal title="전체 검색" onClose={onClose}>
    <div className="global-search" onKeyDown={onKeyDown}>
      <input type="search" autoFocus placeholder="업무, 일정, 할 일, 업무 기록 검색…" aria-label="전체 검색"
        value={query} onChange={e => setQuery(e.target.value)}/>
      {query.trim() && !count ? <p className="global-search-empty">검색 결과가 없습니다.</p> : null}
      {groups.map(({ key, label, Icon }) => (results[key]?.length ? <div className="global-search-group" key={key}>
        <h3><Icon size={14} aria-hidden="true"/>{label}</h3>
        <ul>{results[key].map(item => {
          const flatIndex = flatItems.findIndex(f => f.key === key && f.item.id === item.id)
          return <li key={item.id}>
            <button type="button" ref={el => { if (el) buttonRefs.current[flatIndex] = el }}
              tabIndex={activeIndex === flatIndex || (activeIndex === -1 && flatIndex === 0) ? 0 : -1}
              onClick={() => { openers[key]?.(item); onClose() }}>{labelOf[key](item)}</button>
          </li>
        })}</ul>
      </div> : null))}
    </div>
  </Modal>
}
