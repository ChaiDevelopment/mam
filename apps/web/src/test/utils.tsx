import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Providers } from '@/components/providers';

/** Renders inside the real app providers. `fetch` must be mocked by the test. */
export function renderWithProviders(ui: ReactElement) {
  return render(<Providers>{ui}</Providers>);
}

export function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

export const sampleMe = {
  userId: 'u-1',
  username: 'budi',
  displayName: 'Budi',
  avatarUrl: null,
  bio: null,
  joinedAt: '2026-01-01T00:00:00Z',
  stats: { reviewCount: 0, photoCount: 0, helpfulReceived: 0 },
  badges: [],
  email: 'budi@mam.test',
  emailVerified: true,
  role: 'USER',
  status: 'ACTIVE',
  locationVisibility: 'HIDDEN',
  preferences: { defaultRadiusMeters: 5000, preferredCategories: [], budget: null, saveSearchHistory: true, notificationsEnabled: true },
  linkedProviders: ['google'],
};
