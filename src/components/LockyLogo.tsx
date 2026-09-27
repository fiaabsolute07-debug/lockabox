export function LockyLogo({ size = 34 }: { size?: number }) {
  return (
    <svg className="locky-logo" width={size} height={size} viewBox="0 0 120 124" role="img" aria-label="Locky">
      <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 46h76v54q0 8-8 8H30q-8 0-8-8Z" fill="var(--panel)" />
        <path d="M16 46Q16 28 34 26h52q18 2 18 20Z" fill="var(--accent)" />
        <path d="M44 108v9M76 108v9" fill="none" />
      </g>
      <g fill="currentColor"><circle cx="46" cy="66" r="5" /><circle cx="74" cy="66" r="5" /><circle cx="60" cy="84" r="5" /><path d="M57 86h6l2 10H55Z" /></g>
    </svg>
  );
}
