import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { jsonResponse, renderWithProviders } from '@/test/utils';
import { LocationGate, RadiusSelector } from './location-picker';

function mockGeolocation(impl: (success: PositionCallback, error: PositionErrorCallback) => void) {
  Object.defineProperty(global.navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn(impl) } });
}

describe('Location & radius', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation(() => jsonResponse({ statusCode: 401 }, 401));
    sessionStorage.clear();
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('defaults to exactly 5 km and offers 1/2/3/5/10 km', () => {
    renderWithProviders(<RadiusSelector />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['1 km', '2 km', '3 km', '5 km', '10 km']);
    expect(screen.getByRole('button', { name: '5 km' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lets the user change the radius', async () => {
    renderWithProviders(<RadiusSelector />);
    await userEvent.click(screen.getByRole('button', { name: '2 km' }));
    expect(screen.getByRole('button', { name: '2 km' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('mam:radius')).toBe('2000');
  });

  it('does not request location until the user asks', () => {
    mockGeolocation(() => undefined);
    renderWithProviders(<LocationGate />);
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('falls back to manual search when permission is denied', async () => {
    mockGeolocation((_ok, err) => err({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'denied' } as GeolocationPositionError));
    renderWithProviders(<LocationGate />);
    await userEvent.click(screen.getByRole('button', { name: /Gunakan lokasiku/ }));
    expect(await screen.findByText(/Izin lokasi ditolak/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Cari area atau alamat/)).toBeInTheDocument();
  });

  it('handles a location timeout', async () => {
    mockGeolocation((_ok, err) => err({ code: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'timeout' } as GeolocationPositionError));
    renderWithProviders(<LocationGate />);
    await userEvent.click(screen.getByRole('button', { name: /Gunakan lokasiku/ }));
    await waitFor(() => expect(screen.getByText(/terlalu lama/)).toBeInTheDocument());
  });

  it('requests a one-shot, approximate position (no high-accuracy tracking)', async () => {
    mockGeolocation((ok) => ok({ coords: { latitude: -6.2, longitude: 106.8, accuracy: 30 } } as GeolocationPosition));
    renderWithProviders(<LocationGate />);
    await userEvent.click(screen.getByRole('button', { name: /Gunakan lokasiku/ }));
    const opts = (navigator.geolocation.getCurrentPosition as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(opts).toMatchObject({ enableHighAccuracy: false, timeout: 10000 });
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('mam:loc')!)).toMatchObject({ lat: -6.2, lng: 106.8, source: 'gps' }));
  });
});
