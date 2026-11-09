import { render, screen } from '@testing-library/react';
import type { PlaceSummary } from '@mam/shared-types';
import { PlaceCard, PriceInfo } from './place-card';

const base: PlaceSummary = {
  placeId: 'ChIJtest1234567',
  source: 'GOOGLE',
  local: null,
  restaurantId: null,
  name: 'Warung Bu Tini',
  address: 'Jl. Kenanga 5',
  location: { lat: -6.2, lng: 106.8 },
  distanceMeters: 850,
  primaryType: 'indonesian_restaurant',
  categories: ['indonesian'],
  openNow: true,
  photo: null,
  google: { rating: 4.4, userRatingCount: 321, priceLevel: 'PRICE_LEVEL_INEXPENSIVE', priceRange: null, mapsUri: null },
  community: null,
};

describe('PlaceCard', () => {
  it('labels OpenStreetMap places and shows no Google rating for them', () => {
    const osm: PlaceSummary = {
      ...base,
      placeId: 'mam-00000000-0000-4000-8000-000000000001',
      source: 'OSM',
      address: null,
      google: { rating: null, userRatingCount: null, priceLevel: null, priceRange: null, mapsUri: null },
      local: { brand: null, kind: 'restaurant', cuisine: ['padang'], city: 'Bukittinggi', province: null, osmUrl: 'https://www.openstreetmap.org/node/1', attribution: '© OpenStreetMap contributors' },
    };
    render(<PlaceCard place={osm} />);
    expect(screen.getByText('OSM')).toBeInTheDocument();
    expect(screen.queryByTitle('Rating Google Maps')).toBeNull();
    expect(screen.getByText(/Bukittinggi/)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tempat/mam-00000000-0000-4000-8000-000000000001');
  });

  it('shows Google and MAM! ratings separately with clear labels', () => {
    render(<PlaceCard place={{ ...base, community: { reviewCount: 7, averageOverall: 4.6, medianPricePaid: null, lastReviewedAt: null } }} />);
    expect(screen.getByTitle('Rating Google Maps')).toHaveTextContent('Google');
    expect(screen.getByTitle('Rating Google Maps')).toHaveTextContent('4,4');
    expect(screen.getByTitle('Rating komunitas MAM!')).toHaveTextContent('4,6');
    expect(screen.getByTitle('Rating komunitas MAM!')).toHaveTextContent('(7)');
  });

  it('states when there are no community reviews instead of inventing a rating', () => {
    render(<PlaceCard place={base} />);
    expect(screen.getByTitle('Rating komunitas MAM!')).toHaveTextContent('belum ada ulasan');
  });

  it('formats distance in Indonesian locale and links to the detail page', () => {
    render(<PlaceCard place={base} />);
    expect(screen.getByText(/850 m/)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tempat/ChIJtest1234567');
  });
});

describe('PriceInfo', () => {
  it('labels community-reported prices', () => {
    render(<PriceInfo place={{ google: base.google, community: { reviewCount: 2, averageOverall: 4, medianPricePaid: 22000, lastReviewedAt: null } }} />);
    expect(screen.getByText(/laporan MAM!/)).toBeInTheDocument();
    expect(screen.getByTitle(/dilaporkan pengguna/)).toHaveTextContent(/22\.000/);
  });

  it('labels Google price ranges', () => {
    render(<PriceInfo place={{ community: null, google: { ...base.google, priceRange: { min: 20000, max: 40000, currency: 'IDR' } } }} />);
    expect(screen.getByTitle(/Google Maps/)).toHaveTextContent('(Google)');
  });

  it('never converts a Google price level into a fabricated Rupiah amount', () => {
    const { container } = render(<PriceInfo place={{ community: null, google: base.google }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
