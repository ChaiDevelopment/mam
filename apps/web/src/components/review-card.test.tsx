import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReviewView } from '@mam/shared-types';
import { vi } from 'vitest';
import { jsonResponse, renderWithProviders, sampleMe } from '@/test/utils';
import { ReviewCard } from './review-card';

const review: ReviewView = {
  id: 'r-1',
  restaurantId: 'rest-1',
  restaurantName: 'Bakso Pak Kumis',
  googlePlaceId: 'ChIJbakso00001',
  placeKey: 'ChIJbakso00001',
  author: { userId: 'u-2', username: 'sari', displayName: 'Sari', avatarUrl: null },
  ratings: { taste: 5, price: 4, portion: 4, cleanliness: 3, service: 4, overall: 4 },
  text: 'Kuahnya gurih sekali.',
  pricePaid: 25000,
  currency: 'IDR',
  visitType: 'DINE_IN',
  visitedAt: '2026-11-01',
  status: 'PUBLISHED',
  photos: [],
  reactions: { HELPFUL: 2, YUMMY: 0, FUNNY: 0 },
  myReactions: [],
  createdAt: '2026-11-02T03:00:00Z',
  updatedAt: '2026-11-02T03:00:00Z',
  edited: false,
};

describe('ReviewCard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the five dimensions and the user-reported price label', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => jsonResponse({ statusCode: 401 }, 401));
    renderWithProviders(<ReviewCard review={review} />);
    expect(screen.getByText('Rasa')).toBeInTheDocument();
    expect(screen.getByText('Layanan')).toBeInTheDocument();
    expect(screen.getByText(/dilaporkan pengulas/)).toBeInTheDocument();
  });

  it('applies a reaction optimistically and rolls back when the API fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(sampleMe);
      if (url.includes('/reactions')) return jsonResponse({ statusCode: 500, message: 'Server error' }, 500);
      return jsonResponse({}, 404);
    });
    renderWithProviders(<ReviewCard review={review} />);
    const helpful = await screen.findByRole('button', { name: /Membantu \(2\)/ });
    await waitFor(() => expect(helpful).toBeEnabled());
    await userEvent.click(helpful);
    await waitFor(() => expect(screen.getByRole('button', { name: /Membantu \(2\)/ })).toHaveAttribute('aria-pressed', 'false'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Server error|Gagal/);
  });

  it('disables reactions on your own review and offers Edit instead of Report', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input) => (String(input).endsWith('/auth/me') ? jsonResponse({ ...sampleMe, userId: 'u-2' }) : jsonResponse({}, 404)));
    renderWithProviders(<ReviewCard review={review} />);
    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/tempat/ChIJbakso00001/ulas');
    expect(screen.getByRole('button', { name: /Membantu/ })).toBeDisabled();
    expect(screen.queryByText('Laporkan')).not.toBeInTheDocument();
  });
});
