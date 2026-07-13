import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, ChevronRight, Circle, Clock3, Copy, Pencil, Play, Plus, Sparkles, Square, Star, Trash2, X } from 'lucide-react'
import Header from '../components/Header'
import TagsInput, { TagChips, TagFilter } from '../components/TagsInput'
import { api } from '../api'
import { clearWorkLogTimer, elapsedMinutes, formatElapsed, loadWorkLogTimer, startWorkLogTimer } from '../workLogTimer'
import { loadPinnedTodoIds, orderTodosByPin, savePinnedTodoIds, togglePinnedTodo } from '../todoPins'
import { filterTodosByQuery, filterLogsByQuery } from '../todaySearch'

function localDate(value) {
  if (!value) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
}

function overlapsDay(event, day) {
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)
  const start = localDate(event.start_at || event.start)
  if (!start || Number.isNaN(start.getTime())) return false
  const end = localDate(event.end_at || event.end) || new Date(start.getTime() + 1)
  return start < nextDay && end > dayStart
}

export default function Today(props) {
  const {
    tasks = [], allTasks = [], events = [], todos = [], overdueTodos = [], logs = [], loading,
    onAddTodo, onUpdateTodo, onToggleTodo, onDeleteTodo, onDuplicateTodo, onClearCompletedTodos, onCarryOverTodos,
    onAddLog, onUpdateLog, onDeleteLog, onToggleTask, goAI,
  } = props
  const now = new Date()
  const dateText = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(now)
  const [todoDraft, setTodoDraft] = useState('')
  const [todoTags, setTodoTags] = useState([])
  const [todoRecurrence, setTodoRecurrence] = useState('')
  const [todoPriority, setTodoPriority] = useState('normal')
  const [editRecurrence, setEditRecurrence] = useState('')
  const [editPriority, setEditPriority] = useState('normal')
  const [logDraft, setLogDraft] = useState('')
  const [logTags, setLogTags] = useState([])
  const [logTaskId, setLogTaskId] = useState('')
  const [logMinutes, setLogMinutes] = useState('')
  const [edit, setEdit] = useState(null)
  const [editText, setEditText] = useState('')
  const [editTags, setEditTags] = useState([])
  const [editTaskId, setEditTaskId] = useState('')
  const [editMinutes, setEditMinutes] = useState('')
  const [saving, setSaving] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [query, setQuery] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState({})
  const [timer, setTimer] = useState(() => loadWorkLogTimer())
  const [timerNow, setTimerNow] = useState(() => new Date())
  const [pinnedTodoIds, setPinnedTodoIds] = useState(() => loadPinnedTodoIds())
  const togglePin = todo => setPinnedTodoIds(ids => { const next = togglePinnedTodo(ids, todo.id); savePinnedTodoIds(next); return next })

  useEffect(() => {
    if (!timer) return
    const id = setInterval(() => setTimerNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [timer])

  const startTimer = () => setTimer(startWorkLogTimer(logTaskId ? Number(logTaskId) : null))
  const stopTimer = () => {
    if (!timer) return
    setLogMinutes(String(elapsedMinutes(timer.startedAt, new Date())))
    if (timer.taskId) setLogTaskId(String(timer.taskId))
    clearWorkLogTimer()
    setTimer(null)
  }

  const linkableTasks = useMemo(()=>allTasks.filter(t=>t.status!=='done').sort((a,b)=>a.title.localeCompare(b.title,'ko')),[allTasks])
  const taskTitle = useMemo(()=>new Map(allTasks.map(t=>[t.id,t.title])),[allTasks])
  const allTags = useMemo(
    () => [...new Set([...tasks, ...events, ...todos, ...logs].flatMap(item => item.tags || []))].sort(),
    [tasks, events, todos, logs],
  )
  const matches = item => !selectedTags.length || selectedTags.every(tag => (item.tags || []).includes(tag))
  const todayEvents = events.filter(event => overlapsDay(event, now) && matches(event))
  const active = tasks.filter(task => task.status !== 'done' && matches(task))
  const shownTodos = orderTodosByPin(filterTodosByQuery(todos.filter(matches), query), pinnedTodoIds)
  const completedTodos = shownTodos.filter(todo => todo.completed)
  const shownLogs = filterLogsByQuery(logs.filter(matches), query)

  const submitTodo = async event => {
    event.preventDefault()
    if (!todoDraft.trim()) return
    setSaving('todo')
    if (await onAddTodo(todoDraft.trim(), todoTags, todoRecurrence, todoPriority)) {
      setTodoDraft('')
      setTodoTags([])
      setTodoRecurrence('')
      setTodoPriority('normal')
    }
    setSaving('')
  }
  const submitLog = async event => {
    event.preventDefault()
    if (!logDraft.trim()) return
    setSaving('log')
    if (await onAddLog(logDraft.trim(), logTags, logTaskId ? Number(logTaskId) : null, logMinutes ? Number(logMinutes) : null)) {
      setLogDraft('')
      setLogTags([])
      setLogTaskId('')
      setLogMinutes('')
    }
    setSaving('')
  }
  const beginEdit = (type, item) => {
    setEdit({ type, id: item.id })
    setEditText(item.title || item.content)
    setEditTags(item.tags || [])
    if (type === 'log') { setEditTaskId(item.task_id ?? ''); setEditMinutes(item.duration_minutes ?? '') }
    if (type === 'todo') { setEditRecurrence(item.recurrence_rule || ''); setEditPriority(item.priority || 'normal') }
  }
  const saveEdit = async item => {
    if (!editText.trim()) return
    const key = `${edit.type}-${item.id}`
    setSaving(key)
    const ok = edit.type === 'todo'
      ? await onUpdateTodo(item.id, editText.trim(), editTags, editRecurrence, editPriority)
      : await onUpdateLog(item.id, editText.trim(), editTags, editTaskId ? Number(editTaskId) : null, editMinutes ? Number(editMinutes) : null)
    if (ok) setEdit(null)
    setSaving('')
  }

  const editable = (type, item) => edit?.type === type && edit.id === item.id
  const recommendTags = async (key, entity, text) => {
    if (!text.trim()) return
    setSaving(`tags-${key}`)
    try {
      const result = await api.aiTagSuggestions({ entity, content: text })
      setTagSuggestions(current => ({ ...current, [key]: result.tags || result.items || [] }))
    } catch { setTagSuggestions(current => ({ ...current, [key]: [] })) }
    finally { setSaving('') }
  }
  const recommendationButtons = (key, tags, setTags) => (tagSuggestions[key] || []).map(tag => <button type="button" key={tag} disabled={tags.includes(tag)} onClick={() => setTags([...tags, tag])}>+ #{tag}</button>)
  return <>
    <Header title="오늘" subtitle={`${dateText} · 중요한 일에 집중해 보세요.`}/>
    <div className="content today-grid">
      <section className="focus-panel">
        <div className="section-title"><div><h2>오늘 할 일</h2><p>오늘 예정 업무와 빠른 Todo를 함께 확인합니다.</p></div>{loading ? <span className="status-pill">동기화 중…</span> : null}</div>
        <input className="search" type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="할 일/기록 검색" placeholder="할 일, 업무 기록 검색"/>
        <TagFilter tags={allTags} selected={selectedTags} onChange={setSelectedTags}/>
        <form className="quick-entry" onSubmit={submitTodo}>
          <div className="quick-add"><Plus/><input value={todoDraft} onChange={event => setTodoDraft(event.target.value)} aria-label="오늘 Todo" placeholder="오늘 꼭 할 일을 추가하세요"/><select aria-label="우선순위" value={todoPriority} onChange={event => setTodoPriority(event.target.value)}><option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option></select><select aria-label="반복" value={todoRecurrence} onChange={event => setTodoRecurrence(event.target.value)}><option value="">반복 없음</option><option value="daily">매일</option><option value="weekly">매주</option></select><button disabled={saving === 'todo'}>추가</button></div>
          <TagsInput label="Todo 태그" value={todoTags} onChange={setTodoTags}/><div className="tag-recommend"><button type="button" className="text-button" onClick={() => recommendTags('todo-new', 'todo', todoDraft)}>AI 태그 추천</button>{recommendationButtons('todo-new', todoTags, setTodoTags)}</div>
        </form>
        {completedTodos.length ? <button type="button" className="text-button" onClick={() => onClearCompletedTodos(completedTodos.map(todo => todo.id))}>완료된 항목 정리 ({completedTodos.length})</button> : null}
        {overdueTodos.length ? <div className="carryover-banner"><span>지난 할 일 {overdueTodos.length}개가 남아 있습니다.</span><button type="button" className="text-button" onClick={() => onCarryOverTodos(overdueTodos.map(todo => todo.id))}>오늘로 이월</button></div> : null}
        {shownTodos.length ? <div className="todo-list">{shownTodos.map(todo => <div className={`todo-row ${todo.completed ? 'completed' : ''} ${todo.priority === 'high' ? 'priority-high' : ''}`} key={todo.id}>
          <button className="todo-check" aria-label={`${todo.title} 완료 상태 변경`} onClick={() => onToggleTodo(todo)}>{todo.completed ? <Check/> : <Circle/>}</button>
          <div>{editable('todo', todo) ? <><input className="inline-edit" value={editText} onChange={event => setEditText(event.target.value)}/><select aria-label="우선순위" value={editPriority} onChange={event => setEditPriority(event.target.value)}><option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option></select><select aria-label="반복" value={editRecurrence} onChange={event => setEditRecurrence(event.target.value)}><option value="">반복 없음</option><option value="daily">매일</option><option value="weekly">매주</option></select><TagsInput value={editTags} onChange={setEditTags}/><div className="tag-recommend"><button type="button" className="text-button" onClick={() => recommendTags(`todo-${todo.id}`, 'todo', editText)}>AI 태그 추천</button>{recommendationButtons(`todo-${todo.id}`, editTags, setEditTags)}</div></> : <><span>{todo.title}</span>{pinnedTodoIds.has(todo.id) ? <Star className="task-pinned-icon" aria-hidden="true"/> : null}{todo.priority === 'high' ? <small className="log-task-link">우선순위 높음</small> : null}{todo.recurrence_rule ? <small className="log-task-link">{todo.recurrence_rule === 'daily' ? '매일 반복' : '매주 반복'}</small> : null}<TagChips tags={todo.tags}/></>}</div>
          <span className="row-actions">{editable('todo', todo) ? <><button aria-label="수정 취소" onClick={() => setEdit(null)}><X/></button><button aria-label="수정 저장" disabled={saving === `todo-${todo.id}`} onClick={() => saveEdit(todo)}><Check/></button></> : <><button aria-label={`${todo.title} 수정`} onClick={() => beginEdit('todo', todo)}><Pencil/></button><button className={`task-pin${pinnedTodoIds.has(todo.id) ? ' pinned' : ''}`} aria-label={`${todo.title} ${pinnedTodoIds.has(todo.id) ? '고정 해제' : '고정'}`} title={pinnedTodoIds.has(todo.id) ? '고정 해제' : '목록 상단 고정'} onClick={() => togglePin(todo)}><Star/></button><button aria-label={`${todo.title} 복제`} onClick={() => onDuplicateTodo(todo)}><Copy/></button></>}<button className="danger-icon" aria-label={`${todo.title} 삭제`} onClick={() => onDeleteTodo(todo)}><Trash2/></button></span>
        </div>)}</div> : null}
        <div className="section-divider"><span>오늘 예정 업무</span><b>{active.length}</b></div>
        <div className="task-list">{active.map(task => <div className="task-row" key={task.id}><button className="task-check" aria-label={`${task.title} 완료 상태 변경`} onClick={() => onToggleTask(task)}><Circle/></button><span className="task-main"><strong>{task.title}</strong><small>{task.due_date || '기한 없음'}</small><TagChips tags={task.tags}/></span><span className="mini-progress"><i style={{ width: `${task.progress}%` }}/></span><b>{task.progress}%</b></div>)}</div>
      </section>
      <aside className="today-side">
        <section className="side-panel"><div className="section-title"><div><h2>오늘 일정</h2><p>{todayEvents.length}개의 일정</p></div><CalendarClock/></div>{todayEvents.map(event => <div className="event-row" key={event.id}><time>{event.google_is_all_day ? '종일' : new Date(event.start_at || event.start).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time><i/><div><strong>{event.title}</strong><small>{event.location || '일정'}</small><TagChips tags={event.tags}/></div></div>)}</section>
        <button className="ai-card" onClick={goAI}><Sparkles/><div><strong>AI에게 오늘 할 일 추천받기</strong><p>진행 상황을 분석합니다.</p></div><ChevronRight/></button>
      </aside>
      <section className="log-panel">
        <div className="section-title"><div><h2>오늘 한 일</h2><p>작은 성과도 기록해 두세요.</p></div><Clock3/></div>
        <div className="worklog-timer">{timer ? <><span className="worklog-timer-display">{formatElapsed(timer.startedAt, timerNow)}</span><button type="button" className="text-button" onClick={stopTimer}><Square size={14}/> 타이머 중지</button></> : <button type="button" className="text-button" onClick={startTimer}><Play size={14}/> 타이머 시작</button>}</div>
        <form className="quick-entry" onSubmit={submitLog}><div className="quick-add"><Plus/><input value={logDraft} onChange={event => setLogDraft(event.target.value)} aria-label="오늘 한 일"/><input className="log-minutes" type="number" min="0" max="1440" value={logMinutes} onChange={event => setLogMinutes(event.target.value)} aria-label="소요 시간(분)" placeholder="분"/><button disabled={saving === 'log'}>기록</button></div><select aria-label="연결 업무" value={logTaskId} onChange={e=>setLogTaskId(e.target.value)}><option value="">업무 연결 안 함</option>{linkableTasks.map(t=><option key={t.id} value={t.id}>#{t.id} {t.title}</option>)}</select><TagsInput label="업무 기록 태그" value={logTags} onChange={setLogTags}/><div className="tag-recommend"><button type="button" className="text-button" onClick={() => recommendTags('log-new', 'work_log', logDraft)}>AI 태그 추천</button>{recommendationButtons('log-new', logTags, setLogTags)}</div></form>
        <div className="done-notes">{shownLogs.map(log => <div key={log.id}><Check/><div>{editable('log', log) ? <><input className="inline-edit" value={editText} onChange={event => setEditText(event.target.value)}/><input className="log-minutes" type="number" min="0" max="1440" value={editMinutes} onChange={event => setEditMinutes(event.target.value)} aria-label="소요 시간(분)" placeholder="분"/><select aria-label="연결 업무" value={editTaskId} onChange={e=>setEditTaskId(e.target.value)}><option value="">업무 연결 안 함</option>{linkableTasks.map(t=><option key={t.id} value={t.id}>#{t.id} {t.title}</option>)}</select><TagsInput value={editTags} onChange={setEditTags}/><div className="tag-recommend"><button type="button" className="text-button" onClick={() => recommendTags(`log-${log.id}`, 'work_log', editText)}>AI 태그 추천</button>{recommendationButtons(`log-${log.id}`, editTags, setEditTags)}</div></> : <><span>{log.content}</span>{log.task_id&&taskTitle.has(log.task_id)?<small className="log-task-link">#{log.task_id} {taskTitle.get(log.task_id)}</small>:null}{log.duration_minutes?<small className="log-task-link">{log.duration_minutes}분</small>:null}<TagChips tags={log.tags}/></>}</div><span className="row-actions">{editable('log', log) ? <><button aria-label="수정 취소" onClick={() => setEdit(null)}><X/></button><button aria-label="수정 저장" disabled={saving === `log-${log.id}`} onClick={() => saveEdit(log)}><Check/></button></> : <button aria-label={`${log.content} 수정`} onClick={() => beginEdit('log', log)}><Pencil/></button>}<button className="danger-icon" aria-label={`${log.content} 삭제`} onClick={() => onDeleteLog(log)}><Trash2/></button></span></div>)}</div>
      </section>
    </div>
  </>
}
