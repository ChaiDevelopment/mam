import { makeCreateReviewSchema } from '@mam/validation';
import {
  MODERATION_TRANSITIONS,
  computeOverall,
  computeQualityScore,
  initialStatus,
  spamSignals,
  statusAfterAuthorEdit,
} from './review-rules';

describe('computeOverall', () => {
  it('is the mean of the five dimensions with 2-decimal precision', () => {
    expect(computeOverall({ taste: 5, price: 4, portion: 4, cleanliness: 3, service: 4 })).toBe(4);
    expect(computeOverall({ taste: 5, price: 5, portion: 5, cleanliness: 4, service: 5 })).toBe(4.8);
    expect(computeOverall({ taste: 1, price: 1, portion: 1, cleanliness: 1, service: 2 })).toBe(1.2);
  });
  it('rejects out-of-range or non-integer ratings', () => {
    expect(() => computeOverall({ taste: 6, price: 4, portion: 4, cleanliness: 3, service: 4 })).toThrow(RangeError);
    expect(() => computeOverall({ taste: 0, price: 4, portion: 4, cleanliness: 3, service: 4 })).toThrow(RangeError);
    expect(() => computeOverall({ taste: 4.5, price: 4, portion: 4, cleanliness: 3, service: 4 })).toThrow(RangeError);
  });
});

describe('review validation schema', () => {
  const base = { googlePlaceId: 'ChIJabcdefghijk', ratings: { taste: 5, price: 4, portion: 4, cleanliness: 3, service: 4 }, text: 'x'.repeat(30), visitType: 'DINE_IN' };
  it('requires a restaurant reference', () => {
    expect(() => makeCreateReviewSchema().parse({ ...base, googlePlaceId: undefined })).toThrow();
  });
  it('enforces the configurable minimum text length', () => {
    expect(() => makeCreateReviewSchema(50).parse(base)).toThrow(/minimal 50/);
    expect(makeCreateReviewSchema(10).parse(base).text).toHaveLength(30);
  });
  it('only allows DINE_IN / TAKEAWAY / DELIVERY', () => {
    expect(() => makeCreateReviewSchema().parse({ ...base, visitType: 'CATERING' })).toThrow();
  });
  it('rejects ratings outside 1..5', () => {
    expect(() => makeCreateReviewSchema().parse({ ...base, ratings: { ...base.ratings, taste: 6 } })).toThrow();
  });
  it('rejects visit dates in the future', () => {
    expect(() => makeCreateReviewSchema().parse({ ...base, visitedAt: new Date(Date.now() + 5 * 86400_000).toISOString() })).toThrow();
  });
});

describe('quality score', () => {
  const ratings = { taste: 5, price: 4, portion: 4, cleanliness: 3, service: 4 };
  it('rewards substance, not quantity', () => {
    const thin = computeQualityScore({ text: 'enak', photoCount: 0, ratings: { taste: 5, price: 5, portion: 5, cleanliness: 5, service: 5 } });
    const rich = computeQualityScore({ text: 'x'.repeat(320), photoCount: 2, pricePaid: 25000, visitedAt: new Date(), ratings });
    expect(thin).toBeLessThan(0.1);
    expect(rich).toBe(1);
  });
});

describe('spam signals & status', () => {
  const ok = { text: 'Baksonya enak dan kuahnya gurih sekali', duplicateOfOwnText: false, restaurantBurst: false };
  it('clean review publishes immediately', () => {
    expect(spamSignals(ok)).toEqual([]);
    expect(initialStatus(false, [])).toBe('PUBLISHED');
  });
  it('holds links, phone numbers, duplicates and bursts for moderation', () => {
    expect(spamSignals({ ...ok, text: 'promo cek www.promo.example sekarang' })).toContain('contains_link');
    expect(spamSignals({ ...ok, text: 'pesan wa 081234567890 ya' })).toContain('contains_phone');
    expect(spamSignals({ ...ok, duplicateOfOwnText: true })).toContain('duplicate_text');
    expect(spamSignals({ ...ok, restaurantBurst: true })).toContain('restaurant_review_burst');
    expect(initialStatus(false, ['contains_link'])).toBe('PENDING');
  });
  it('approval mode holds every review', () => {
    expect(initialStatus(true, [])).toBe('PENDING');
  });
  it('editing a hidden/rejected review sends it back to the queue', () => {
    expect(statusAfterAuthorEdit('HIDDEN', false, [])).toBe('PENDING');
    expect(statusAfterAuthorEdit('REJECTED', false, [])).toBe('PENDING');
    expect(statusAfterAuthorEdit('PUBLISHED', false, [])).toBe('PUBLISHED');
  });
  it('moderation transitions are explicit', () => {
    expect(MODERATION_TRANSITIONS.PUBLISH.from).toEqual(['PENDING']);
    expect(MODERATION_TRANSITIONS.HIDE.to).toBe('HIDDEN');
    expect(MODERATION_TRANSITIONS.RESTORE.to).toBe('PUBLISHED');
  });
});
