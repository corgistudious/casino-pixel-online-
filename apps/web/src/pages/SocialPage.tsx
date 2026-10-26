import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../net/api';
import { AppShell, PageHeader } from '../ui/AppShell';
import { toast } from '../ui/toast';

type Friend = {uid:number;display_name:string};
type ChatMessage = {id:number;sender_uid?:number;uid?:number;body:string;created_at:string};
const Button=({children,onClick,disabled=false}:{children:React.ReactNode;onClick:()=>void;disabled?:boolean})=><button className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-black disabled:opacity-50" disabled={disabled} onClick={onClick}>{children}</button>;

export function FriendsPage(){
 const {i18n}=useTranslation();const vi=i18n.language.startsWith('vi');
 const [friends,setFriends]=useState<Friend[]>([]),[incoming,setIncoming]=useState<Friend[]>([]),[uid,setUid]=useState(''),[selected,setSelected]=useState<number|null>(null),[messages,setMessages]=useState<ChatMessage[]>([]),[body,setBody]=useState('');
 const refresh=async()=>{const r=await api<{friends:Friend[];incoming:Friend[]}>('/api/friends');setFriends(r.friends);setIncoming(r.incoming);};
 useEffect(()=>{void refresh().catch(()=>{});},[]);
 useEffect(()=>{if(!selected||selected===1000)return;const load=()=>void api<{messages:ChatMessage[]}>(`/api/dm/${selected}`).then(r=>setMessages(r.messages)).catch(()=>{});load();const timer=setInterval(load,4000);return()=>clearInterval(timer);},[selected]);
 const action=async(path:string,recipient:number)=>{try{await api(path,{method:'POST',body:{uid:recipient}});await refresh();toast(vi?'Đã cập nhật':'Updated','success');}catch(e){toast(String(e),'error');}};
 const send=async()=>{if(!selected||!body.trim())return;try{await api(`/api/dm/${selected}`,{method:'POST',body:{body}});setBody('');const r=await api<{messages:ChatMessage[]}>(`/api/dm/${selected}`);setMessages(r.messages);}catch(e){toast(String(e),'error');}};
 return <AppShell><div className="flex h-full flex-col gap-3 overflow-auto p-4"><PageHeader icon="friends" title={vi?'Bạn bè':'Friends'} subtitle={vi?'Kết bạn và trò chuyện riêng':'Connect and message friends'}/>
 <div className="glass flex gap-2 p-3"><input className="field min-w-0 flex-1" inputMode="numeric" placeholder="UID" value={uid} onChange={e=>setUid(e.target.value)}/><Button onClick={()=>void action('/api/friends/request',Number(uid))}>{vi?'Kết bạn':'Add friend'}</Button></div>
 {incoming.length>0&&<div className="glass space-y-2 p-3"><h3>{vi?'Lời mời':'Requests'}</h3>{incoming.map(f=><div key={f.uid} className="flex items-center justify-between"><span>{f.display_name} ({f.uid})</span><Button onClick={()=>void action('/api/friends/accept',f.uid)}>{vi?'Đồng ý':'Accept'}</Button></div>)}</div>}
 <div className="glass space-y-2 p-3"><h3 className="font-bold">{vi?'Danh sách bạn bè':'Friends list'}</h3>{friends.map(f=><div key={f.uid} className="flex items-center justify-between gap-2"><span>{f.display_name} (UID {f.uid})</span>{f.uid===1000?<Link className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-black" to="/support">Support Hub</Link>:<div className="flex gap-2"><Button onClick={()=>setSelected(f.uid)}>{vi?'Nhắn tin':'Message'}</Button><button className="text-red-300" onClick={()=>void action('/api/friends/remove',f.uid)}>×</button></div>}</div>)}</div>
 {selected&&selected!==1000&&<div className="glass flex min-h-48 flex-col gap-2 p-3"><div className="flex justify-between"><b>DM · {selected}</b><button onClick={()=>setSelected(null)}>×</button></div><div className="max-h-56 flex-1 space-y-2 overflow-auto">{messages.map(m=><div key={m.id} className="rounded bg-white/5 p-2"><small>{m.sender_uid}</small><p className="break-words">{m.body}</p></div>)}</div><form className="flex gap-2" onSubmit={e=>{e.preventDefault();void send();}}><input className="field flex-1" maxLength={500} value={body} onChange={e=>setBody(e.target.value)}/><button className="rounded bg-amber-500 px-3 text-black">{vi?'Gửi':'Send'}</button></form></div>}
 </div></AppShell>;
}

export function GuildPage(){
 const {i18n}=useTranslation();const vi=i18n.language.startsWith('vi');const [guild,setGuild]=useState<null|{id:string;name:string;points:number;rank:string;role:string;members:Friend[]}>(null),[list,setList]=useState<Array<{id:string;name:string;points:string}>>([]),[name,setName]=useState(''),[messages,setMessages]=useState<ChatMessage[]>([]),[body,setBody]=useState('');
 const refresh=async()=>{const [g,l]=await Promise.all([api<{guild:typeof guild}>('/api/guild'),api<{guilds:typeof list}>('/api/guild/list')]);setGuild(g.guild);setList(l.guilds);if(g.guild){const m=await api<{messages:ChatMessage[]}>('/api/guild/chat');setMessages(m.messages);}};
 useEffect(()=>{void refresh().catch(()=>{});const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh().catch(()=>{});},6000);return()=>clearInterval(timer);},[]);
 const post=async(path:string,payload:unknown)=>{try{await api(path,{method:'POST',body:payload});await refresh();toast(vi?'Thành công':'Success','success');}catch(e){toast(String(e),'error');}};
 return <AppShell><div className="flex h-full flex-col gap-3 overflow-auto p-4"><PageHeader icon="friends" title={vi?'Bang hội':'Guilds'} subtitle={vi?'Thăng hạng bằng chiến thắng thật':'Rank up through real wins'}/>
 {guild?<><div className="glass p-4"><h2 className="text-xl font-bold text-amber-300">{guild.name} · {guild.rank}</h2><p>{vi?'Điểm hoạt động':'Activity points'}: {guild.points}</p><p>{vi?'Thành viên':'Members'}: {guild.members.map(m=>m.display_name).join(', ')}</p></div><div className="glass flex flex-col gap-2 p-3"><h3>{vi?'Chat bang hội':'Guild chat'}</h3><div className="max-h-60 space-y-2 overflow-auto">{messages.map(m=><p key={m.id} className="rounded bg-white/5 p-2"><small>UID {m.uid}</small> {m.body}</p>)}</div><form className="flex gap-2" onSubmit={e=>{e.preventDefault();void post('/api/guild/chat',{body});setBody('');}}><input className="field flex-1" maxLength={500} value={body} onChange={e=>setBody(e.target.value)}/><button className="rounded bg-amber-500 px-3 text-black">{vi?'Gửi':'Send'}</button></form></div></>:<><div className="glass flex gap-2 p-3"><input className="field flex-1" maxLength={40} placeholder={vi?'Tên bang hội':'Guild name'} value={name} onChange={e=>setName(e.target.value)}/><Button onClick={()=>void post('/api/guild',{name})}>{vi?'Tạo (300 Cxu Vàng)':'Create (300 Gold)'}</Button></div><div className="glass space-y-2 p-3">{list.map(g=><div key={g.id} className="flex items-center justify-between"><span>{g.name} · {g.points} pts</span><Button onClick={()=>void post('/api/guild/join',{id:g.id})}>{vi?'Gia nhập':'Join'}</Button></div>)}</div></>}
 </div></AppShell>;
}

export function MissionsPage(){
 const {i18n}=useTranslation();const vi=i18n.language.startsWith('vi');const [quests,setQuests]=useState<Array<{id:string;period:string;target:number;progress:number;silver:number;claimed:boolean}>>([]);
 const refresh=async()=>{const r=await api<{quests:typeof quests}>('/api/quests');setQuests(r.quests);};useEffect(()=>{void refresh().catch(()=>{});},[]);
 const claim=async(id:string)=>{try{await api('/api/quests/claim',{method:'POST',body:{id}});await refresh();toast(vi?'Đã nhận thưởng':'Reward claimed','success');}catch(e){toast(String(e),'error');}};
 const labels:Record<string,[string,string]>={daily_play:['Chơi 3 lượt hôm nay','Play 3 rounds today'],daily_win:['Thắng 1 lần hôm nay','Win once today'],weekly_play:['Chơi 20 lượt trong tuần','Play 20 rounds this week'],weekly_win:['Thắng 10 lần trong tuần','Win 10 times this week']};
 return <AppShell><div className="flex h-full flex-col gap-3 overflow-auto p-4"><PageHeader icon="collection" title={vi?'Nhiệm vụ':'Missions'} subtitle={vi?'Tiến độ từ lịch sử chơi thật · làm mới UTC':'Progress from real game history · resets UTC'}/>{quests.map(q=><div key={q.id} className="glass flex items-center justify-between gap-3 p-4"><div><b>{labels[q.id]?.[vi?0:1]??q.id}</b><p className="text-sm text-white/60">{Math.min(q.progress,q.target)}/{q.target} · +{q.silver.toLocaleString()} Cxu Bạc</p></div><Button disabled={q.claimed||q.progress<q.target} onClick={()=>void claim(q.id)}>{q.claimed?(vi?'Đã nhận':'Claimed'):(vi?'Nhận':'Claim')}</Button></div>)}</div></AppShell>;
}
