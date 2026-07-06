import { useState } from 'react'
import { X } from 'lucide-react'
const clean=value=>value.trim().replace(/^#/,'').slice(0,40)
export default function TagsInput({name='tags',value=[],onChange,label='태그'}){const [draft,setDraft]=useState(''),tags=Array.isArray(value)?value:[];const add=raw=>{const tag=clean(raw);if(tag&&!tags.includes(tag)&&tags.length<20)onChange([...tags,tag]);setDraft('')};return <div className="tags-field"><span>{label}</span><div className="tag-editor">{tags.map(tag=><button type="button" className="tag-chip" key={tag} onClick={()=>onChange(tags.filter(x=>x!==tag))}>#{tag}<X/></button>)}<input aria-label={`${label} 입력`} value={draft} placeholder="태그 입력 후 Enter" onChange={e=>setDraft(e.target.value)} onBlur={()=>add(draft)} onKeyDown={e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();add(draft)}if(e.key==='Backspace'&&!draft&&tags.length)onChange(tags.slice(0,-1))}}/></div><input type="hidden" name={name} value={JSON.stringify(tags)}/></div>}

export function TagFilter({tags=[],selected=[],onChange}){if(!tags.length)return null;return <div className="tag-filter" aria-label="태그 필터">{tags.map(tag=><button key={tag} className={selected.includes(tag)?'selected':''} aria-pressed={selected.includes(tag)} onClick={()=>onChange(selected.includes(tag)?selected.filter(x=>x!==tag):[...selected,tag])}>#{tag}</button>)}</div>}

export function TagChips({tags=[]}){return tags?.length?<span className="tag-chips">{tags.map(tag=><small key={tag}>#{tag}</small>)}</span>:null}
