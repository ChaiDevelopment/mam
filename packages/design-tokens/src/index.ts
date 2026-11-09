/**
 * MAM! design tokens — single source of truth for web, admin and Android.
 * Android tokens are generated from this file by `npm run generate -w @mam/design-tokens`.
 */
export const colors = {
  primary: '#FF9F43',
  primaryDark: '#E8842A',
  primarySoft: '#FFE7D1',
  secondary: '#FFD166',
  secondarySoft: '#FFF3D6',
  accent: '#FF6B6B',
  accentSoft: '#FFE1E1',
  background: '#FFF9F0',
  surface: '#FFFFFF',
  surfaceMuted: '#FBF3E8',
  border: '#F0E4D4',
  text: '#252525',
  textMuted: '#858585',
  onPrimary: '#252525',
  success: '#38A169',
  successSoft: '#E3F4EA',
  danger: '#E05252',
  dangerSoft: '#FBE4E4',
  /** Neutral tone used for anything sourced from Google (kept visually distinct from MAM! orange). */
  google: '#4A5568',
  googleSoft: '#EDF0F4',
  /** Single-series data mark. Validated (dataviz validator) for lightness band + ≥3:1 contrast on light surface. */
  chart: '#C2621A',
} as const;

export const darkColors = {
  ...colors,
  background: '#1B1712',
  surface: '#26211B',
  surfaceMuted: '#2F2921',
  border: '#3A3229',
  text: '#F7F1E8',
  textMuted: '#B3A999',
  primarySoft: '#4A3218',
  secondarySoft: '#46391A',
  accentSoft: '#4A2323',
  successSoft: '#1E3527',
  dangerSoft: '#4A2222',
  googleSoft: '#2C323B',
  /** Validated against dark surface #26211B. */
  chart: '#D9761E',
} as const;

export const typography = {
  fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  /** size / line-height in px */
  scale: {
    display: [32, 40],
    h1: [26, 34],
    h2: [21, 28],
    h3: [18, 24],
    body: [15, 22],
    small: [13, 18],
    caption: [12, 16],
  },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const shadow = {
  card: '0 2px 12px rgba(120, 72, 20, 0.08)',
  raised: '0 8px 28px rgba(120, 72, 20, 0.14)',
} as const;

export const motion = { fast: 120, base: 200, slow: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' } as const;

export type ColorToken = keyof typeof colors;

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** CSS custom properties for light + dark themes. */
export function toCssVariables(): string {
  const light = Object.entries(colors)
    .map(([k, v]) => `  --mam-${kebab(k)}: ${v};`)
    .join('\n');
  const dark = Object.entries(darkColors)
    .map(([k, v]) => `    --mam-${kebab(k)}: ${v};`)
    .join('\n');
  const radii = Object.entries(radius)
    .map(([k, v]) => `  --mam-radius-${k}: ${v}px;`)
    .join('\n');
  return `:root {\n${light}\n${radii}\n  --mam-shadow-card: ${shadow.card};\n  --mam-shadow-raised: ${shadow.raised};\n}\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {\n${dark}\n  }\n}\n:root[data-theme='dark'] {\n${dark.replace(/^ {4}/gm, '  ')}\n}\n`;
}

/** Tailwind theme extension that maps utility classes to the CSS variables. */
export const tailwindPreset = {
  theme: {
    extend: {
      colors: Object.fromEntries(
        Object.keys(colors).map((k) => [kebab(k), `var(--mam-${kebab(k)})`]),
      ),
      fontFamily: { sans: ['var(--font-jakarta)', 'system-ui', 'sans-serif'] },
      borderRadius: Object.fromEntries(Object.entries(radius).map(([k, v]) => [k, `${v}px`])),
      boxShadow: { card: 'var(--mam-shadow-card)', raised: 'var(--mam-shadow-raised)' },
      fontSize: Object.fromEntries(
        Object.entries(typography.scale).map(([k, [s, l]]) => [k, [`${s}px`, `${l}px`]]),
      ),
    },
  },
};
