// Station icons: a monitor for PCs, a controller for consoles.

export function ConsoleIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 28" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 7h14a7 7 0 0 1 7 7v3.5a5 5 0 0 1-9 3L19.5 18h-7L11 20.5a5 5 0 0 1-9-3V14a7 7 0 0 1 7-7z" strokeLinejoin="round" />
      <path d="M8.5 11.5v5M6 14h5" strokeLinecap="round" />
      <circle cx="22" cy="12.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="25" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function StationIcon({ type, className = '' }: { type: string; className?: string }) {
  return type === 'PC' ? <MonitorIcon className={className} /> : <ConsoleIcon className={className} />;
}

export function MonitorIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 28" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="2" width="28" height="18" rx="2.5" />
      <path d="M12 26h8M16 20v6" strokeLinecap="round" />
      <path d="M6 15h20" strokeOpacity="0.45" />
    </svg>
  );
}

