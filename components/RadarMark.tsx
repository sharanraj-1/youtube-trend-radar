/** Brand mark: gradient tile with a radar sweep. */
export function RadarMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="rm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#rm)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="4.5" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.5" />
      <path d="M16 16 L23.5 8.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.8" fill="#fff" />
    </svg>
  );
}
