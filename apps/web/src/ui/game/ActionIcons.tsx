/**
 * V7.1 action icons (own artwork, 2.5D: filled shapes with a light top and a dark rim so they read
 * on the metallic buttons). currentColor = the button's text colour; the rim is a translucent dark.
 */
export type ActionIconName = 'fold' | 'check' | 'call' | 'raise' | 'allin' | 'hit' | 'stand' | 'double' | 'split' | 'deal' | 'spin' | 'roll' | 'clear' | 'rebet' | 'confirm';

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
        <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

export function ActionIcon({ name, size = 24 }: { name: ActionIconName; size?: number }) {
  const g = `ai-${name}`;
  const rim = { stroke: 'rgba(20,10,30,0.45)', strokeWidth: 1.2, strokeLinejoin: 'round' as const };
  const body = (() => {
    switch (name) {
      case 'fold': // two cards thrown down
        return (
          <>
            <rect x="3" y="6" width="11" height="15" rx="2" transform="rotate(-14 8.5 13.5)" fill="currentColor" opacity="0.75" {...rim} />
            <rect x="9" y="3.5" width="11" height="15" rx="2" transform="rotate(10 14.5 11)" fill="currentColor" {...rim} />
            <path d="M12.2 9.4l4.6 4.6M16.8 9.4l-4.6 4.6" stroke="rgba(20,10,30,0.55)" strokeWidth="1.8" strokeLinecap="round" transform="rotate(10 14.5 11)" />
          </>
        );
      case 'check': // knock on the table
        return <path d="M4.5 12.5l4.6 4.6L19.5 6.7" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />;
      case 'call': // a chip
        return (
          <>
            <circle cx="12" cy="12" r="9" fill="currentColor" {...rim} />
            <circle cx="12" cy="12" r="5.6" fill="none" stroke="rgba(20,10,30,0.45)" strokeWidth="1.4" strokeDasharray="2.2 1.6" />
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <rect key={a} x="10.9" y="2.6" width="2.2" height="3" rx="0.6" fill="rgba(20,10,30,0.45)" transform={`rotate(${a} 12 12)`} />
            ))}
          </>
        );
      case 'raise': // arrow up over a chip stack
        return (
          <>
            <path d="M12 3l7 7.5h-4.2V16H9.2v-5.5H5z" fill="currentColor" {...rim} />
            <rect x="6" y="18" width="12" height="3" rx="1.5" fill="currentColor" opacity="0.8" {...rim} />
          </>
        );
      case 'allin': // stacked chips with a spark
        return (
          <>
            {[17, 13, 9].map((y, i) => (
              <ellipse key={y} cx="11" cy={y} rx="7" ry="2.6" fill="currentColor" opacity={1 - i * 0.12} {...rim} />
            ))}
            <path d="M19 3l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="currentColor" />
          </>
        );
      case 'hit': // card plus
        return (
          <>
            <rect x="4" y="3" width="12" height="17" rx="2" fill="currentColor" {...rim} />
            <circle cx="17.5" cy="17" r="4.8" fill="currentColor" {...rim} />
            <path d="M17.5 14.6v4.8M15.1 17h4.8" stroke="rgba(20,10,30,0.6)" strokeWidth="1.8" strokeLinecap="round" />
          </>
        );
      case 'stand': // open hand
        return <path d="M7 12V6.5a1.5 1.5 0 0 1 3 0V11V4.8a1.5 1.5 0 0 1 3 0V11V5.8a1.5 1.5 0 0 1 3 0V12V8.5a1.5 1.5 0 0 1 3 0v5.5a7 7 0 0 1-7 7h-.6A6.4 6.4 0 0 1 6 18.3L3.6 14a1.6 1.6 0 0 1 2.7-1.7z" fill="currentColor" {...rim} />;
      case 'double': // ×2 chip
        return (
          <>
            <circle cx="12" cy="12" r="9" fill="currentColor" {...rim} />
            <text x="12" y="15.6" textAnchor="middle" fontSize="10" fontWeight="900" fill="rgba(20,10,30,0.7)" fontFamily="Be Vietnam Pro, system-ui, sans-serif">×2</text>
          </>
        );
      case 'split': // two cards apart
        return (
          <>
            <rect x="2.5" y="5" width="9" height="13" rx="1.6" transform="rotate(-10 7 11.5)" fill="currentColor" {...rim} />
            <rect x="12.5" y="5" width="9" height="13" rx="1.6" transform="rotate(10 17 11.5)" fill="currentColor" {...rim} />
          </>
        );
      case 'deal': // fanned cards
        return (
          <>
            <rect x="5" y="4" width="10" height="15" rx="1.8" transform="rotate(-16 10 11.5)" fill="currentColor" opacity="0.7" {...rim} />
            <rect x="9" y="4" width="10" height="15" rx="1.8" transform="rotate(8 14 11.5)" fill="currentColor" {...rim} />
          </>
        );
      case 'spin': // wheel
        return (
          <>
            <circle cx="12" cy="12" r="9" fill="currentColor" {...rim} />
            <circle cx="12" cy="12" r="3" fill="rgba(20,10,30,0.5)" />
            {[0, 45, 90, 135].map((a) => (
              <path key={a} d="M12 3.6v16.8" stroke="rgba(20,10,30,0.4)" strokeWidth="1.2" transform={`rotate(${a} 12 12)`} />
            ))}
          </>
        );
      case 'roll': // die
        return (
          <>
            <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="currentColor" {...rim} />
            {[[8, 8], [16, 8], [12, 12], [8, 16], [16, 16]].map(([x, y]) => (
              <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" fill="rgba(20,10,30,0.6)" />
            ))}
          </>
        );
      case 'clear':
        return <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />;
      case 'rebet':
        return <path d="M5 12a7 7 0 1 0 2.1-5M5 4v4h4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />;
      case 'confirm':
        return (
          <>
            <circle cx="12" cy="12" r="9" fill="currentColor" {...rim} />
            <path d="M7.5 12.3l3 3 6-6.2" fill="none" stroke="rgba(20,10,30,0.65)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </>
        );
    }
  })();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" className="pbtn-icon">
      <Defs id={g} />
      {body}
    </svg>
  );
}
