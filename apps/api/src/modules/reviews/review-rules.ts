import type { ReviewStatus } from '@mam/shared-types';

/** Pure business rules for reviews — unit tested in review-rules.spec.ts. */

export interface RatingInput {
  taste: number;
  price: number;
  portion: number;
  cleanliness: number;
  service: number;
}

/** Overall rating = arithmetic mean of the five dimensions, rounded to 2 decimals (DECIMAL(3,2)). */
export function computeOverall(r: RatingInput): number {
  const vals = [r.taste, r.price, r.portion, r.cleanliness, r.service];
  for (const v of vals) {
    if (!Number.isInteger(v) || v < 1 || v > 5) throw new RangeError('Ratings must be integers between 1 and 5');
  }
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

/**
 * Quality score in [0, 1] — used ONLY for badges/leaderboards so that quantity alone is never rewarded.
 * Signals: substantive text, original photos, price & visit details, and non-uniform ratings.
 */
export function computeQualityScore(input: { text: string; photoCount: number; pricePaid?: number | null; visitedAt?: Date | null; ratings: RatingInput }): number {
  const len = input.text.trim().length;
  const textScore = Math.min(1, len / 300) * 0.4;
  const photoScore = Math.min(1, input.photoCount / 2) * 0.25;
  const priceScore = input.pricePaid !== null && input.pricePaid !== undefined ? 0.1 : 0;
  const visitScore = input.visitedAt ? 0.1 : 0;
  const r = input.ratings;
  const uniform = new Set([r.taste, r.price, r.portion, r.cleanliness, r.service]).size === 1;
  const nuance = uniform ? 0 : 0.15;
  return Math.round((textScore + photoScore + priceScore + visitScore + nuance) * 100) / 100;
}

const URL_RE = /(https?:\/\/|www\.)\S+/i;
const PHONE_RE = /(\+?62|0)8\d{8,11}/;

/** Spam heuristics: suspicious reviews are held for moderation (PENDING) rather than rejected. */
export function spamSignals(input: { text: string; duplicateOfOwnText: boolean; restaurantBurst: boolean }): string[] {
  const s: string[] = [];
  if (URL_RE.test(input.text)) s.push('contains_link');
  if (PHONE_RE.test(input.text.replace(/[\s-]/g, ''))) s.push('contains_phone');
  if (/(.)\1{9,}/.test(input.text)) s.push('repeated_characters');
  if (input.duplicateOfOwnText) s.push('duplicate_text');
  // Account age alone is not evidence of spam (it would hold every newcomer's first review);
  // coordinated new-account activity is caught by restaurantBurst instead.
  if (input.restaurantBurst) s.push('restaurant_review_burst');
  return s;
}

export function initialStatus(requireApproval: boolean, signals: string[]): ReviewStatus {
  return requireApproval || signals.length > 0 ? 'PENDING' : 'PUBLISHED';
}

/** Status after the author edits. Moderated-away reviews go back to the queue instead of auto-publishing. */
export function statusAfterAuthorEdit(current: ReviewStatus, requireApproval: boolean, signals: string[]): ReviewStatus {
  if (current === 'HIDDEN' || current === 'REJECTED') return 'PENDING';
  if (current === 'PENDING') return 'PENDING';
  return initialStatus(requireApproval, signals);
}

/** Number of distinct open reports that auto-hides a review pending moderator review. */
export const AUTO_HIDE_REPORT_THRESHOLD = 5;

export const MODERATION_TRANSITIONS: Record<string, { from: ReviewStatus[]; to: ReviewStatus }> = {
  HIDE: { from: ['PUBLISHED', 'PENDING'], to: 'HIDDEN' },
  REJECT: { from: ['PENDING', 'PUBLISHED', 'HIDDEN'], to: 'REJECTED' },
  RESTORE: { from: ['HIDDEN', 'REJECTED', 'DELETED'], to: 'PUBLISHED' },
  PUBLISH: { from: ['PENDING'], to: 'PUBLISHED' },
  DELETE: { from: ['PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED'], to: 'DELETED' },
};
