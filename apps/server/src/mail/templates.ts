export type MailTemplate = 'verify_email' | 'email_verified' | 'reset_password' | 'password_changed' | 'activate_account' | 'account_deleted';
export type MailLocale = 'vi' | 'en';

interface Rendered {
  subject: string;
  text: string;
  html: string;
}

const COPY: Record<MailTemplate, Record<MailLocale, { subject: string; lines: (v: Record<string, string>) => string[]; cta?: string }>> = {
  verify_email: {
    vi: {
      subject: 'Xác minh email Keyo Game',
      lines: (v) => [`Chào ${v.name},`, `Mã xác minh của bạn là: ${v.code}`, 'Mã có hiệu lực trong 30 phút. Bạn cũng có thể bấm vào liên kết bên dưới.'],
      cta: 'Xác minh email',
    },
    en: {
      subject: 'Verify your Keyo Game email',
      lines: (v) => [`Hi ${v.name},`, `Your verification code is: ${v.code}`, 'The code is valid for 30 minutes. You can also use the link below.'],
      cta: 'Verify email',
    },
  },
  email_verified: {
    vi: { subject: 'Email đã được xác minh', lines: (v) => [`Chào ${v.name},`, 'Email của bạn đã được xác minh. Tài khoản Keyo Game đã được kích hoạt đầy đủ.'] },
    en: { subject: 'Email verified', lines: (v) => [`Hi ${v.name},`, 'Your email is verified and your Keyo Game account is fully active.'] },
  },
  reset_password: {
    vi: {
      subject: 'Đặt lại mật khẩu Keyo Game',
      lines: (v) => [`Chào ${v.name},`, `Mã đặt lại mật khẩu: ${v.code}`, 'Mã có hiệu lực trong 30 phút và chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.'],
      cta: 'Đặt lại mật khẩu',
    },
    en: {
      subject: 'Reset your Keyo Game password',
      lines: (v) => [`Hi ${v.name},`, `Your reset code: ${v.code}`, 'It is valid for 30 minutes and works once. If you did not ask for this, ignore this email.'],
      cta: 'Reset password',
    },
  },
  password_changed: {
    vi: { subject: 'Mật khẩu đã được thay đổi', lines: (v) => [`Chào ${v.name},`, 'Mật khẩu tài khoản Keyo Game của bạn vừa được thay đổi và mọi phiên đăng nhập cũ đã bị đăng xuất.', 'Nếu không phải bạn, hãy liên hệ Keyo Support ngay.'] },
    en: { subject: 'Your password was changed', lines: (v) => [`Hi ${v.name},`, 'Your Keyo Game password was just changed and all previous sessions were signed out.', 'If this was not you, contact Keyo Support right away.'] },
  },
  activate_account: {
    vi: {
      subject: 'Kích hoạt tài khoản Keyo Game',
      lines: (v) => [`Chào ${v.name},`, `Một tài khoản UID ${v.uid} đã được tạo cho bạn. Mã kích hoạt: ${v.code}`, 'Hãy đặt mật khẩu của riêng bạn qua liên kết bên dưới. Không ai được yêu cầu bạn gửi mật khẩu hay mã này.'],
      cta: 'Kích hoạt tài khoản',
    },
    en: {
      subject: 'Activate your Keyo Game account',
      lines: (v) => [`Hi ${v.name},`, `An account with UID ${v.uid} was created for you. Activation code: ${v.code}`, 'Set your own password with the link below. Nobody will ever ask you for your password or this code.'],
      cta: 'Activate account',
    },
  },
  account_deleted: {
    vi: { subject: 'Tài khoản đã được xóa', lines: (v) => [`Chào ${v.name},`, 'Yêu cầu xóa tài khoản Keyo Game của bạn đã được xử lý. Dữ liệu cá nhân đã được ẩn danh hóa.'] },
    en: { subject: 'Account deleted', lines: (v) => [`Hi ${v.name},`, 'Your Keyo Game account deletion request has been processed and your personal data was anonymised.'] },
  },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderMail(template: MailTemplate, locale: MailLocale, vars: Record<string, string>, link?: string): Rendered {
  const c = COPY[template][locale];
  const lines = c.lines(vars);
  const footer = locale === 'vi' ? 'Keyo Game chỉ dùng tiền ảo. Keyo Support không bao giờ hỏi mật khẩu hay mã OTP của bạn.' : 'Keyo Game uses virtual currency only. Keyo Support will never ask for your password or OTP.';
  const text = [...lines, ...(link && c.cta ? ['', `${c.cta}: ${link}`] : []), '', '— Keyo Game', footer].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#0b0822;font-family:Arial,sans-serif;color:#f4f1ff">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#16103a;border:1px solid #f2c14e55;border-radius:16px">
<tr><td style="padding:28px 32px 8px;font-family:Georgia,serif;font-size:26px;font-weight:bold;letter-spacing:3px;color:#f2c14e">KEYO GAME</td></tr>
<tr><td style="padding:8px 32px 24px;font-size:15px;line-height:1.6">${lines.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join('')}
${link && c.cta ? `<p style="margin:20px 0"><a href="${esc(link)}" style="background:#f2c14e;color:#1a1036;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">${esc(c.cta)}</a></p>` : ''}
<p style="margin:24px 0 0;font-size:12px;color:#a9a3c9">${esc(footer)}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: c.subject, text, html };
}
