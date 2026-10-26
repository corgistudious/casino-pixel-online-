import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../net/api';
import { AppShell, PageHeader } from '../ui/AppShell';
import { toast } from '../ui/toast';

const Button=({children,onClick,disabled=false}:{children:React.ReactNode;onClick:()=>void;disabled?:boolean})=><button className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-black disabled:opacity-50" disabled={disabled} onClick={onClick}>{children}</button>;

export function MissionsPage(){
 const {i18n}=useTranslation();const vi=i18n.language.startsWith('vi');const [quests,setQuests]=useState<Array<{id:string;period:string;target:number;progress:number;silver:number;claimed:boolean}>>([]);
 const refresh=async()=>{const r=await api<{quests:typeof quests}>('/api/quests');setQuests(r.quests);};useEffect(()=>{void refresh().catch(()=>{});},[]);
 const claim=async(id:string)=>{try{await api('/api/quests/claim',{method:'POST',body:{id}});await refresh();toast(vi?'Đã nhận thưởng':'Reward claimed','success');}catch(e){toast(String(e),'error');}};
 const labels:Record<string,[string,string]>={daily_play:['Chơi 3 lượt hôm nay','Play 3 rounds today'],daily_win:['Thắng 1 lần hôm nay','Win once today'],weekly_play:['Chơi 20 lượt trong tuần','Play 20 rounds this week'],weekly_win:['Thắng 10 lần trong tuần','Win 10 times this week']};
 return <AppShell><div className="flex h-full flex-col gap-3 overflow-auto p-4"><PageHeader icon="collection" title={vi?'Nhiệm vụ':'Missions'} subtitle={vi?'Tiến độ từ lịch sử chơi thật · làm mới UTC':'Progress from real game history · resets UTC'}/>{quests.map(q=><div key={q.id} className="glass flex items-center justify-between gap-3 p-4"><div><b>{labels[q.id]?.[vi?0:1]??q.id}</b><p className="text-sm text-white/60">{Math.min(q.progress,q.target)}/{q.target} · +{q.silver.toLocaleString()} Cxu Bạc</p></div><Button disabled={q.claimed||q.progress<q.target} onClick={()=>void claim(q.id)}>{q.claimed?(vi?'Đã nhận':'Claimed'):(vi?'Nhận':'Claim')}</Button></div>)}</div></AppShell>;
}
