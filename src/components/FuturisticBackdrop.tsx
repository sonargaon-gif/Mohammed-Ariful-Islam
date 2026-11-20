const PARTICLES = [
  { left: '8%', top: '16%', size: 4, delay: '0s', duration: '6.2s' },
  { left: '22%', top: '68%', size: 3, delay: '1.1s', duration: '7.4s' },
  { left: '37%', top: '28%', size: 5, delay: '2.4s', duration: '8.1s' },
  { left: '54%', top: '76%', size: 3, delay: '0.6s', duration: '6.8s' },
  { left: '68%', top: '19%', size: 4, delay: '1.8s', duration: '7.2s' },
  { left: '83%', top: '54%', size: 5, delay: '3.1s', duration: '8.6s' },
  { left: '91%', top: '24%', size: 3, delay: '0.9s', duration: '6.4s' },
  { left: '14%', top: '86%', size: 4, delay: '2.1s', duration: '7.9s' },
];

export function FuturisticBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0"
    >
      {/* Deep midnight navy ambient radial glow (dark mode) / subtle sky tint (light mode) */}
      <div className="absolute -top-40 left-1/4 w-[640px] h-[640px] rounded-full bg-blue-600/10 dark:bg-[#2563EB]/16 blur-3xl" />
      <div className="absolute bottom-0 right-1/6 w-[560px] h-[560px] rounded-full bg-cyan-400/10 dark:bg-[#06B6D4]/12 blur-3xl" />

      {/* Subtle geometric grid lines */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.055]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #38BDF8 1px, transparent 1px), linear-gradient(to bottom, #38BDF8 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Lightweight compositor-only floating particles (dark mode emphasis) */}
      <div className="hidden dark:block">
        {PARTICLES.map((p, idx) => (
          <span
            key={idx}
            className="fc-particle absolute rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.8)]"
            style={{
              left: p.left,
              top: p.top,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDelay: p.delay,
              animationDuration: p.duration,
            }}
          />
        ))}
      </div>
    </div>
  );
}
