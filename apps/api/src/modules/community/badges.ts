import type { BadgeCode } from '@mam/shared-types';

/** Minimum quality score for a review to count towards badges/leaderboards (prevents rewarding spam). */
export const QUALITY_THRESHOLD = 0.4;

export const BADGE_DEFINITIONS: Record<BadgeCode, { name: string; description: string; criteria: string }> = {
  FIRST_BITE: {
    name: 'First Bite',
    description: 'Menerbitkan ulasan pertama di MAM!.',
    criteria: '≥ 1 ulasan berstatus PUBLISHED.',
  },
  FOOD_EXPLORER: {
    name: 'Food Explorer',
    description: 'Menjelajahi berbagai jenis kuliner.',
    criteria: 'Ulasan berkualitas untuk tempat di ≥ 5 kategori berbeda.',
  },
  HIDDEN_GEM_HUNTER: {
    name: 'Hidden Gem Hunter',
    description: 'Menemukan tempat yang kemudian dikonfirmasi komunitas.',
    criteria: 'Pengulas pertama untuk ≥ 3 tempat yang kini punya ≥ 3 ulasan dari pengguna lain dengan rata-rata ≥ 4,0.',
  },
  REVIEW_MASTER: {
    name: 'Review Master',
    description: 'Ulasan yang konsisten berkualitas dan membantu.',
    criteria: '≥ 20 ulasan berkualitas dan ≥ 25 reaksi "Membantu" dari pengguna lain.',
  },
  LOCAL_FOODIE: {
    name: 'Local Foodie',
    description: 'Ahli kuliner di lingkungan sendiri.',
    criteria: '≥ 8 ulasan berkualitas untuk tempat dalam radius 3 km dari satu sama lain.',
  },
  PHOTO_HUNTER: {
    name: 'Photo Hunter',
    description: 'Membagikan foto makanan orisinal.',
    criteria: '≥ 15 foto pada ≥ 5 ulasan berbeda yang diterbitkan.',
  },
};
