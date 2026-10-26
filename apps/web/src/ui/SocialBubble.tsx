import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../net/api';
import { useSession } from '../store/session';

/** Lightweight draggable/minimizable social launcher; all platforms share the same UI. */
export function SocialBubble(){
 const user=useSession(s=>s.user);const navigate=useNavigate();const [expanded,setExpanded]=useState(false),[unread,setUnread]=useState(0),[pos,setPos]=useState({x:16,y:130});
 const drag=useRef<{x:number;y:number;startX:number;startY:number;moved:boolean}|null>(null);
 useEffect(()=>{if(!user)return;const poll=()=>{if(document.visibilityState==='visible')void api<{count:number}>('/api/social/unread').then(r=>setUnread(r.count)).catch(()=>{});};poll();const t=setInterval(poll,5000);return()=>clearInterval(t);},[user]);
 if(!user||user.status!=='active')return null;
 const go=(path:string)=>{setExpanded(false);navigate(path);};
 return <div className="fixed z-[80] select-none" style={{right:pos.x,top:pos.y,touchAction:'none'}} onPointerDown={e=>{if((e.target as HTMLElement).closest('button[data-menu]'))return;drag.current={x:e.clientX,y:e.clientY,startX:pos.x,startY:pos.y,moved:false};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>6)d.moved=true;setPos({x:Math.max(0,Math.min(window.innerWidth-55,d.startX-dx)),y:Math.max(0,Math.min(window.innerHeight-65,d.startY+dy))});}} onPointerUp={()=>{if(drag.current&&!drag.current.moved)setExpanded(v=>!v);drag.current=null;}}>
 <div className="relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-300 bg-[#251849] text-xl shadow-xl">💬{unread>0&&<span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-xs text-white">{unread>99?'99+':unread}</span>}</div>
 {expanded&&<div className="absolute right-0 top-14 flex w-44 flex-col gap-2 rounded-xl border border-amber-400/50 bg-[#170e30] p-3 shadow-xl" style={{touchAction:'auto'}}>
 <button data-menu onClick={()=>go('/chat')} className="rounded bg-white/10 p-2 text-left text-white">🌐 Lobby</button>
 <button data-menu onClick={()=>go('/friends')} className="rounded bg-white/10 p-2 text-left text-white">👥 Friends / DM</button>
 <button data-menu onClick={()=>go('/guild')} className="rounded bg-white/10 p-2 text-left text-white">🏰 Guild</button>
 <button data-menu onClick={()=>go('/missions')} className="rounded bg-white/10 p-2 text-left text-white">🎯 Missions</button>
 <button data-menu onClick={()=>setExpanded(false)} className="text-xs text-white/60">×</button>
 </div>}</div>;
}
