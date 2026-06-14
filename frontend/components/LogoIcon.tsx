export function LogoIcon({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Main gradient — light blue → deep blue */}
        <linearGradient id="gMain" x1="25" y1="10" x2="75" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#4FD6FF" />
          <stop offset="45%"  stopColor="#1A90FF" />
          <stop offset="100%" stopColor="#004FE8" />
        </linearGradient>

        {/* Darker gradient for shadow faces */}
        <linearGradient id="gDark" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#005FCC" />
          <stop offset="100%" stopColor="#002499" />
        </linearGradient>

        {/* Handle gradient */}
        <linearGradient id="gHandle" x1="40" y1="65" x2="60" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#1070EE" />
          <stop offset="100%" stopColor="#001E8A" />
        </linearGradient>

        {/* Glow filter for ring */}
        <filter id="ringGlow" x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── RING — partial, gap at bottom-left, ~310° arc ───────────────── */}
      {/* circumference ≈ 267.0 for r=42.5; gap ≈ 57 units (≈77°) */}
      <circle
        cx="50" cy="50" r="42.5"
        stroke="url(#gMain)"
        strokeWidth="1.8"
        strokeDasharray="210 57"
        strokeDashoffset="28"
        strokeLinecap="round"
        filter="url(#ringGlow)"
        opacity="0.80"
      />

      {/* Ring node dots */}
      <circle cx="50"  cy="7.5" r="2.8" fill="#4FD6FF" />
      <circle cx="92.5" cy="50" r="2.2" fill="#1A90FF" opacity="0.85" />
      <circle cx="7.5"  cy="50" r="2.2" fill="#1A90FF" opacity="0.85" />
      <circle cx="79"   cy="16" r="1.6" fill="#1A90FF" opacity="0.65" />
      <circle cx="21"   cy="16" r="1.6" fill="#1A90FF" opacity="0.65" />

      {/* ── LEFT TINE ───────────────────────────────────────────────────── */}
      {/* Front bright face */}
      <polygon points="37,32 33,22 27,33 37,63 42,60 40,33" fill="url(#gMain)" />
      {/* Left shadow face */}
      <polygon points="27,33 37,63 37,32" fill="#003FAF" opacity="0.55" />
      {/* Inner highlight edge */}
      <polygon points="40,33 42,60 40,60 38,32" fill="#6ADDFF" opacity="0.18" />

      {/* ── CENTER TINE (tallest) ─────────────────────────────────────── */}
      {/* Front face */}
      <polygon points="50,13 46,24 47,64 53,64 54,24" fill="url(#gMain)" />
      {/* Left shadow face */}
      <polygon points="46,24 44,33 46,64 47,64" fill="#004CC0" opacity="0.52" />
      {/* Right shadow face */}
      <polygon points="54,24 56,33 54,64 53,64" fill="#0036A0" opacity="0.52" />
      {/* Center highlight */}
      <polygon points="50,13 52,24 51,64 50,64 48,24" fill="#7AE8FF" opacity="0.15" />

      {/* ── RIGHT TINE ──────────────────────────────────────────────────── */}
      {/* Front bright face */}
      <polygon points="63,32 67,22 73,33 63,63 58,60 60,33" fill="url(#gMain)" />
      {/* Right shadow face */}
      <polygon points="73,33 63,63 63,32" fill="#0038A8" opacity="0.55" />
      {/* Inner highlight edge */}
      <polygon points="60,33 58,60 60,60 62,32" fill="#6ADDFF" opacity="0.18" />

      {/* ── CROSSBAR ────────────────────────────────────────────────────── */}
      {/* Top face (lighter) */}
      <polygon points="39,62 61,62 63,66 37,66" fill="url(#gMain)" />
      {/* Bottom face (darker) */}
      <polygon points="37,66 63,66 61,69 39,69" fill="#004ABB" opacity="0.82" />

      {/* ── LEFT BARB ───────────────────────────────────────────────────── */}
      <polygon points="39,64 29,61 30,71 40,69" fill="url(#gMain)" />
      <polygon points="29,61 30,71 37,67" fill="#003AA8" opacity="0.50" />

      {/* ── RIGHT BARB ──────────────────────────────────────────────────── */}
      <polygon points="61,64 71,61 70,71 60,69" fill="url(#gMain)" />
      <polygon points="71,61 70,71 63,67" fill="#0032A0" opacity="0.50" />

      {/* ── HANDLE — tapers to point at bottom ──────────────────────────── */}
      {/* Front face */}
      <polygon points="39,69 61,69 55,84 50,92 45,84" fill="url(#gHandle)" />
      {/* Left shadow */}
      <polygon points="39,69 50,92 45,84" fill="#001C88" opacity="0.62" />
      {/* Right shadow */}
      <polygon points="61,69 50,92 55,84" fill="#001577" opacity="0.62" />
      {/* Center highlight strip */}
      <polygon points="50,69 52,84 50,92 48,84" fill="#3ABAFF" opacity="0.18" />
    </svg>
  );
}
