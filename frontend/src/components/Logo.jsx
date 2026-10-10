/**
 * Yieldline brand mark + wordmark.
 *
 * Mark (32x32 grid): a metro line leaves an origin station (ring), runs level,
 * then climbs in two 45-degree steps like a rising yield curve and terminates
 * in a burnt-orange station dot -- the "yield".
 *
 * variant 'dark'  -> for the forest-green sidebar (ivory mark, white wordmark)
 * variant 'light' -> for light surfaces (forest mark, ink wordmark)
 * The accent uses CSS vars so it collapses to mono in the bw theme.
 */
export function LogoMark({ size = 28, variant = 'dark', title = 'Yieldline', style }) {
  const dark = variant === 'dark';
  const ink = dark ? '#F7F6F0' : '#163C35';
  const accent = dark ? 'var(--on-dark-accent, #D97745)' : 'var(--orange, #D97745)';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label={title}
      style={{ display: 'block', flexShrink: 0, color: ink, ...style }}
    >
      <path
        d="M8.5 22H11.5L17.5 16H20L26 10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="22" r="2.5" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="26" cy="10" r="4" style={{ fill: accent }} />
    </svg>
  );
}

export default function Logo({ size = 28, variant = 'dark', withWordmark = true, subtitle }) {
  const dark = variant === 'dark';
  const wordColor = dark ? '#FFFFFF' : '#202824';
  const subColor = dark ? '#F7F6F0' : '#202824';
  const fontSize = Math.round(size * 0.72);

  return (
    <div style={{ display: 'flex', alignItems: subtitle ? 'flex-start' : 'center', gap: Math.round(size * 0.36) }}>
      <LogoMark size={size} variant={variant} style={subtitle ? { marginTop: Math.round((fontSize * 1.15 - size) / 2) } : undefined} />
      {withWordmark && (
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span
            style={{
              fontFamily: "Manrope, Inter, system-ui, sans-serif",
              fontWeight: 800,
              fontSize,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              color: wordColor,
              whiteSpace: 'nowrap',
            }}
          >
            Yield<span style={{ fontWeight: 500 }}>line</span>
          </span>
          {subtitle && (
            <span
              style={{
                fontFamily: "var(--font)",
                fontSize: 12,
                lineHeight: 1.35,
                marginTop: 3,
                color: subColor,
                opacity: 0.6,
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
