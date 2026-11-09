/* Original MAM! illustrations — simple, friendly, food-themed. Colors come from design tokens. */
import type { SVGProps } from 'react';

export function MamLogo({ className = 'h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 132 40" className={className} role="img" aria-label="MAM!">
      <g>
        <path d="M4 18h28a14 14 0 0 1-28 0z" fill="var(--mam-primary)" />
        <rect x="2" y="15" width="32" height="4" rx="2" fill="var(--mam-primary-dark)" />
        <path d="M12 6c-2 3 2 4 0 7M18 4c-2 3 2 5 0 8M24 6c-2 3 2 4 0 7" stroke="var(--mam-accent)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <circle cx="13" cy="25" r="1.6" fill="var(--mam-text)" />
        <circle cx="23" cy="25" r="1.6" fill="var(--mam-text)" />
        <path d="M15.5 28.5q2.5 2 5 0" stroke="var(--mam-text)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </g>
      <text x="42" y="29" fontFamily="var(--font-jakarta), sans-serif" fontWeight="800" fontSize="24" fill="var(--mam-text)">
        MAM<tspan fill="var(--mam-accent)">!</tspan>
      </text>
    </svg>
  );
}

export function BowlIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true" {...props}>
      <ellipse cx="80" cy="108" rx="56" ry="7" fill="var(--mam-border)" />
      <path d="M22 58h116a58 46 0 0 1-116 0z" fill="var(--mam-primary)" />
      <path d="M22 58h116" stroke="var(--mam-primary-dark)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="58" cy="52" r="10" fill="var(--mam-secondary)" />
      <circle cx="84" cy="50" r="12" fill="#C98B4E" />
      <circle cx="106" cy="53" r="8" fill="var(--mam-success)" />
      <path d="M60 30c-5 6 5 9 0 15M80 22c-5 6 5 10 0 17M100 30c-5 6 5 9 0 15" stroke="var(--mam-accent)" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".7" />
      <circle cx="66" cy="78" r="3" fill="var(--mam-text)" />
      <circle cx="94" cy="78" r="3" fill="var(--mam-text)" />
      <path d="M73 86q7 6 14 0" stroke="var(--mam-text)" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function MapPinIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true" {...props}>
      <ellipse cx="80" cy="110" rx="40" ry="6" fill="var(--mam-border)" />
      <path d="M80 104s-34-34-34-58a34 34 0 0 1 68 0c0 24-34 58-34 58z" fill="var(--mam-accent)" />
      <circle cx="80" cy="46" r="17" fill="var(--mam-surface)" />
      <path d="M70 38l20 16M90 38L70 54" stroke="var(--mam-primary)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="122" cy="30" r="8" fill="var(--mam-secondary)" />
      <circle cx="36" cy="70" r="6" fill="var(--mam-primary)" />
    </svg>
  );
}

export function EmptyPlateIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden="true" {...props}>
      <ellipse cx="80" cy="64" rx="56" ry="40" fill="var(--mam-surface)" stroke="var(--mam-border)" strokeWidth="4" />
      <ellipse cx="80" cy="64" rx="36" ry="24" fill="none" stroke="var(--mam-border)" strokeWidth="3" strokeDasharray="6 6" />
      <path d="M18 30v40M12 30v14a6 6 0 0 0 12 0V30" stroke="var(--mam-text-muted)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M144 30c-8 4-8 20 0 24v24" stroke="var(--mam-text-muted)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="72" cy="62" r="2.5" fill="var(--mam-text-muted)" />
      <circle cx="88" cy="62" r="2.5" fill="var(--mam-text-muted)" />
      <path d="M74 72q6-4 12 0" stroke="var(--mam-text-muted)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function DiceIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" {...props}>
      <rect x="22" y="22" width="76" height="76" rx="18" fill="var(--mam-secondary)" transform="rotate(-8 60 60)" />
      <g fill="var(--mam-text)" transform="rotate(-8 60 60)">
        <circle cx="42" cy="42" r="6" />
        <circle cx="60" cy="60" r="6" />
        <circle cx="78" cy="78" r="6" />
      </g>
      <path d="M100 18l4 8 8 4-8 4-4 8-4-8-8-4 8-4z" fill="var(--mam-accent)" />
    </svg>
  );
}
