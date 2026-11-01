import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicUser } from '@casino/shared';
import { api } from '../net/api';
import { useSession } from '../store/session';
import { Button } from '../ui/Button';

export function WelcomeModal() {
  const { i18n } = useTranslation();
  const show = useSession(s => s.justRegistered);
  const user = useSession(s => s.user);
  const setUser = useSession(s => s.setUser);
  const dismiss = useSession(s => s.dismissWelcome);
  const [age,setAge]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  if (!show || !user) return null;
  const vi=i18n.language.startsWith('vi');
  const saveCard=()=>{
    const c=document.createElement('canvas');c.width=1000;c.height=560;
    const x=c.getContext('2d');if(!x)return;
    const g=x.createLinearGradient(0,0,1000,560);g.addColorStop(0,'#19132b');g.addColorStop(1,'#42200b');
    x.fillStyle=g;x.fillRect(0,0,1000,560);
    x.fillStyle='#f8d77a';x.font='bold 62px sans-serif';x.fillText('KEYO GAME',65,110);
    x.fillStyle='#ffffff';x.font='36px sans-serif';
    x.fillText(`${vi?'Tên hiển thị':'Display name'}: ${user.displayName}`,65,230);
    x.fillText(`UID: ${user.uid}`,65,305);
    x.font='26px sans-serif';x.fillStyle='#f8d77a';
    x.fillText(vi?'Giữ UID an toàn. Ảnh không chứa mật khẩu.':'Keep your UID safe. Password is never shown.',65,430);
    const a=document.createElement('a');a.download=`keyo-account-${user.uid}.png`;a.href=c.toDataURL('image/png');a.click();
  };
  const finish=async()=>{
    const n=Number(age);
    if (!Number.isInteger(n)||n<18||n>120){setError(vi?'Vui lòng nhập tuổi hợp lệ (18–120).':'Enter a valid age (18–120).');return;}
    setBusy(true);setError('');
    try { const r=await api<{user:PublicUser}>('/api/me',{method:'PATCH',body:{age:n}});setUser(r.user);dismiss(); }
    catch {setError(vi?'Không thể lưu hồ sơ. Vui lòng thử lại.':'Could not save profile. Please retry.');}
    finally {setBusy(false);}
  };
  return <div className="overlay z-40 flex items-center justify-center bg-ink-950/90" role="dialog" aria-modal="true">
    <div className="glass w-full max-w-md space-y-4 p-6">
      <img src="/assets/official/keyo-game-logo.png" alt="Keyo Game" className="mx-auto h-24 object-contain" />
      <h2 className="text-center font-display text-xl font-bold text-gold">{vi?'Tài khoản đã tạo thành công!':'Account created!'}</h2>
      <div className="rounded-xl border border-gold-300/30 bg-black/30 p-4 text-sm">
        <p>{vi?'Tên hiển thị':'Display name'}: <strong>{user.displayName}</strong></p>
        <p>UID: <strong>{user.uid}</strong></p>
        <p className="mt-2 text-xs text-white/60">{vi?'Ảnh tài khoản không chứa mật khẩu.':'Account image does not include password.'}</p>
      </div>
      <Button variant="gold" size="lg" className="w-full" onClick={saveCard}>{vi?'Lưu thông tin thành ảnh PNG':'Save account card as PNG'}</Button>
      <label className="block text-sm">{vi?'Tuổi của bạn (18+)':'Your age (18+)'}
        <input className="field mt-1 w-full" type="number" min={18} max={120} required value={age} onChange={e=>setAge(e.target.value)} />
      </label>
      {error&&<p className="text-sm text-ruby-400">{error}</p>}
      <Button variant="gold" size="lg" className="w-full" disabled={busy} onClick={()=>void finish()}>{vi?'Hoàn tất và vào game':'Finish and enter game'}</Button>
    </div>
  </div>;
}
