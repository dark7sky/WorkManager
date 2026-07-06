import { useEffect, useState } from 'react'
import { api } from './api'
import AppShell from './components/AppShell'
import Login from './components/Login'
import Modal from './components/Modal'
import TaskForm from './components/TaskForm'
import Today from './screens/Today'
import Tasks from './screens/Tasks'
import Calendar from './screens/Calendar'
import AIAssistant from './screens/AIAssistant'

export default function App() {
  const [user, setUser] = useState(null), [checking, setChecking] = useState(true)
  const [page, setPage] = useState('today'), [tasks, setTasks] = useState([]), [events, setEvents] = useState([]), [notes, setNotes] = useState([])
  const [loginState, setLoginState] = useState({busy:false,error:'',google:false}), [modal, setModal] = useState(false)
  const [aiText, setAiText] = useState(''), [preview, setPreview] = useState(null), [aiBusy, setAiBusy] = useState(false)

  useEffect(() => { Promise.all([api.config().catch(()=>({google_enabled:false})), api.me().catch(()=>null)]).then(([c,m]) => { setLoginState(s=>({...s,google:c.google_enabled})); setUser(m?.user||null); setChecking(false) }) }, [])
  useEffect(() => { if(user) refresh() }, [user])
  const refresh = async () => { const [t,e,today] = await Promise.all([api.tasks(),api.events(),api.today()]); setTasks(t); setEvents(e.map((x,i)=>({...x,start:x.start_at,end:x.end_at,color:['blue','purple','orange'][i%3]}))); setNotes(today.work_logs.map(x=>x.content)) }
  const login = async (id,password) => { setLoginState(s=>({...s,busy:true,error:''})); try { const r=await api.login(id,password); setUser(r.user) } catch(e){ setLoginState(s=>({...s,error:e.message})) } finally { setLoginState(s=>({...s,busy:false})) } }
  const logout = async()=>{ await api.logout(); setUser(null) }
  const saveTask = async data=>{ await api.createTask({...data,priority:data.priority==='medium'?'normal':data.priority,tags:data.category?[data.category]:[]}); setModal(false); refresh() }
  const progress = async(task,value)=>{ setTasks(xs=>xs.map(x=>x.id===task.id?{...x,progress:value}:x)); await api.updateTask(task.id,{progress:value,status:value===100?'done':value>0?'doing':'todo'}) }
  const addNote = async content=>{ await api.createLog({content,log_date:new Date().toISOString().slice(0,10)}); refresh() }
  const analyze = async()=>{ setAiBusy(true); try{ const r=await api.aiPreview(aiText); setPreview({...r,...r.data,title:r.data?.title,description:r.data?.description,start_date:r.data?.start_date,due_date:r.data?.due_date,confidence:Math.round((r.confidence||0)*100)}) } finally{setAiBusy(false)} }
  const apply=async()=>{ if(!preview)return; await api.aiApply({action:preview.action,entity:preview.entity,id:preview.id,data:preview.data}); setPreview(null); setAiText(''); await refresh(); setPage('today') }
  if(checking) return <div className="app-loading">WorkManager</div>
  if(!user) return <Login onLogin={login} busy={loginState.busy} error={loginState.error} googleEnabled={loginState.google}/>
  const screens={today:<Today tasks={tasks} events={events.filter(e=>e.start?.slice(0,10)===new Date().toISOString().slice(0,10))} notes={notes} onAddNote={addNote} onToggleTask={t=>progress(t,t.progress===100?0:100)} goAI={()=>setPage('ai')}/>,tasks:<Tasks tasks={tasks} onNew={()=>setModal(true)} onProgress={progress}/>,calendar:<Calendar events={events}/>,ai:<AIAssistant text={aiText} setText={setAiText} preview={preview} loading={aiBusy} onPreview={analyze} onApply={apply}/>}
  return <AppShell page={page} setPage={setPage} onLogout={logout}>{screens[page]}{modal?<Modal title="새 업무" onClose={()=>setModal(false)}><TaskForm onSave={saveTask} onCancel={()=>setModal(false)}/></Modal>:null}</AppShell>
}
