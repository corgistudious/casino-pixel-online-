/** Official Keyo Game artwork is shared across navigation, auth and splash. */
export function KeyoCrest({ size = 64 }: { size?: number }) {
  return (
    <img src="/assets/official/keyo-game-logo.png" alt="Keyo Game" width={size} height={size} className="inline-block object-contain" />
  );
}

export function KeyoLogo({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/assets/official/keyo-game-logo.png"
      alt="Keyo Game"
      className={`inline-block max-w-full object-contain ${className}`}
      style={{ height: size, width: 'auto' }}
    />
  );
}
