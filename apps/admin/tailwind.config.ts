import type { Config } from 'tailwindcss';
import { tailwindPreset } from '@mam/design-tokens';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [tailwindPreset as unknown as Partial<Config>],
  theme: {
    extend: {
      keyframes: {
        'pop-in': { '0%': { transform: 'scale(.96)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        wiggle: { '0%,100%': { transform: 'rotate(0)' }, '25%': { transform: 'rotate(-8deg)' }, '75%': { transform: 'rotate(8deg)' } },
      },
      animation: { 'pop-in': 'pop-in 200ms cubic-bezier(.2,.8,.2,1)', wiggle: 'wiggle 400ms ease-in-out' },
    },
  },
  plugins: [],
} satisfies Config;
