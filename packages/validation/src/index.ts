import { z } from 'zod';
import {
  BudgetBuckets,
  CategorySlugs,
  DEFAULT_RADIUS_METERS,
  DeliveryProviders,
  LocationVisibilities,
  ModerationActionTypes,
  RADIUS_OPTIONS_METERS,
  ReactionTypes,
  ReportReasons,
  ReportStatuses,
  Roles,
  SortOptions,
  UserStatuses,
  VisitTypes,
} from '@mam/shared-types';

/** Default; the effective value is configurable server-side via REVIEW_MIN_TEXT_LENGTH / platform config. */
export const DEFAULT_REVIEW_MIN_TEXT_LENGTH = 20;
export const REVIEW_MAX_TEXT_LENGTH = 3000;
export const MAX_PHOTOS_PER_REVIEW = 6;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const NEARBY_DEFAULT_LIMIT = 100;
export const NEARBY_MAX_LIMIT = 1000;

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const rating = z.number().int().min(1).max(5);
const uuid = z.string().uuid();
/** Google Place IDs are opaque URL-safe tokens. */
export const placeIdSchema = z
  .string()
  .min(10)
  .max(300)
  .regex(/^[A-Za-z0-9_-]+$/, 'Place ID tidak valid');

const csvEnumArray = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v),
    z.array(z.enum(values)).max(values.length),
  );

const booleanish = z.preprocess(
  (v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : v),
  z.boolean(),
);

export const radiusSchema = z.coerce
  .number()
  .int()
  .refine((v) => (RADIUS_OPTIONS_METERS as readonly number[]).includes(v), {
    message: `Radius harus salah satu dari ${RADIUS_OPTIONS_METERS.join(', ')} meter`,
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

// ───────────── Discovery ─────────────
export const nearbyQuerySchema = z.object({
  lat,
  lng,
  radius: radiusSchema.default(DEFAULT_RADIUS_METERS),
  categories: csvEnumArray(CategorySlugs).optional(),
  budget: z.enum(BudgetBuckets).optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  sort: z.enum(SortOptions).default('NEAREST'),
  openNow: booleanish.optional(),
  /** How many places to return (nearest first; places with community reviews first for rating sorts). */
  limit: z.coerce.number().int().min(1).max(NEARBY_MAX_LIMIT).default(NEARBY_DEFAULT_LIMIT),
});
export type NearbyQuery = z.infer<typeof nearbyQuerySchema>;

export const textSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  lat: lat.optional(),
  lng: lng.optional(),
  radius: radiusSchema.default(DEFAULT_RADIUS_METERS),
});
export type TextSearchQuery = z.infer<typeof textSearchQuerySchema>;

export const autocompleteQuerySchema = z.object({
  input: z.string().trim().min(1).max(120),
  lat: lat.optional(),
  lng: lng.optional(),
  sessionToken: z.string().uuid().optional(),
  /** "food" = restaurants/food places; "geocode" = areas/addresses for manual location. */
  kind: z.enum(['food', 'geocode']).default('food'),
});

export const surpriseQuerySchema = z.object({
  lat,
  lng,
  radius: radiusSchema.default(DEFAULT_RADIUS_METERS),
  categories: csvEnumArray(CategorySlugs).optional(),
  budget: z.enum(BudgetBuckets).optional(),
  minCommunityRating: z.coerce.number().min(1).max(5).optional(),
  openNow: booleanish.optional(),
  excludePlaceIds: z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v),
    z.array(placeIdSchema).max(30),
  ).optional(),
});
export type SurpriseQuery = z.infer<typeof surpriseQuerySchema>;

export const homeQuerySchema = z.object({ lat: lat.optional(), lng: lng.optional(), radius: radiusSchema.default(DEFAULT_RADIUS_METERS) });

// ───────────── Reviews ─────────────
export const reviewRatingsSchema = z.object({
  taste: rating,
  price: rating,
  portion: rating,
  cleanliness: rating,
  service: rating,
});

export function makeCreateReviewSchema(minTextLength = DEFAULT_REVIEW_MIN_TEXT_LENGTH) {
  return z
    .object({
      /** Either an internal restaurant UUID or a Google Place ID must be provided. */
      restaurantId: uuid.optional(),
      googlePlaceId: placeIdSchema.optional(),
      ratings: reviewRatingsSchema,
      text: z
        .string()
        .trim()
        .min(minTextLength, `Ulasan minimal ${minTextLength} karakter`)
        .max(REVIEW_MAX_TEXT_LENGTH),
      pricePaid: z.number().int().min(0).max(10_000_000).nullable().optional(),
      visitType: z.enum(VisitTypes),
      visitedAt: z.coerce
        .date()
        .refine((d) => d.getTime() <= Date.now() + 24 * 3600 * 1000, 'Tanggal kunjungan tidak boleh di masa depan')
        .nullable()
        .optional(),
      photoIds: z.array(uuid).max(MAX_PHOTOS_PER_REVIEW).optional(),
    })
    .refine((v) => !!v.restaurantId || !!v.googlePlaceId, {
      message: 'restaurantId atau googlePlaceId wajib diisi',
      path: ['restaurantId'],
    });
}
export const createReviewSchema = makeCreateReviewSchema();
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export function makeUpdateReviewSchema(minTextLength = DEFAULT_REVIEW_MIN_TEXT_LENGTH) {
  return z
    .object({
      ratings: reviewRatingsSchema.optional(),
      text: z.string().trim().min(minTextLength, `Ulasan minimal ${minTextLength} karakter`).max(REVIEW_MAX_TEXT_LENGTH).optional(),
      pricePaid: z.number().int().min(0).max(10_000_000).nullable().optional(),
      visitType: z.enum(VisitTypes).optional(),
      visitedAt: z.coerce.date().nullable().optional(),
      photoIds: z.array(uuid).max(MAX_PHOTOS_PER_REVIEW).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, 'Tidak ada perubahan');
}
export const updateReviewSchema = makeUpdateReviewSchema();
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;

export const reviewFeedQuerySchema = paginationSchema.extend({
  scope: z.enum(['latest', 'nearby']).default('latest'),
  lat: lat.optional(),
  lng: lng.optional(),
  radius: radiusSchema.default(DEFAULT_RADIUS_METERS),
});

export const restaurantReviewsQuerySchema = paginationSchema.extend({
  sort: z.enum(['recent', 'helpful', 'highest', 'lowest']).default('recent'),
});

export const reactionSchema = z.object({ type: z.enum(ReactionTypes) });
export const reportSchema = z.object({
  reason: z.enum(ReportReasons),
  details: z.string().trim().max(1000).optional(),
});

// ───────────── Users ─────────────
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_.]+$/, 'Username hanya boleh huruf kecil, angka, titik, dan garis bawah');

export const updateMeSchema = z.object({
  username: usernameSchema.optional(),
  displayName: z.string().trim().min(1).max(60).optional(),
  bio: z.string().trim().max(280).nullable().optional(),
  locationVisibility: z.enum(LocationVisibilities).optional(),
  preferences: z
    .object({
      defaultRadiusMeters: radiusSchema.optional(),
      preferredCategories: z.array(z.enum(CategorySlugs)).max(14).optional(),
      budget: z.enum(BudgetBuckets).nullable().optional(),
      saveSearchHistory: z.boolean().optional(),
      notificationsEnabled: z.boolean().optional(),
    })
    .optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const deleteAccountSchema = z.object({ confirm: z.literal('HAPUS AKUN SAYA') });

// ───────────── Auth ─────────────
export const googleIdTokenSchema = z.object({
  idToken: z.string().min(20).max(4096),
  /** Raw nonce generated by the native client; verified against the token's nonce claim. */
  nonce: z.string().min(16).max(256),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(512).optional() });

// ───────────── Email + password login ─────────────
export const PASSWORD_MIN_LENGTH = 8;
const emailSchema = z.string().trim().toLowerCase().email('Email tidak valid').max(254);
const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter`)
  .max(128, 'Kata sandi maksimal 128 karakter');
const authClient = z.enum(['WEB', 'ADMIN', 'ANDROID']).default('WEB');

export const registerSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  displayName: z.string().trim().min(2, 'Nama minimal 2 karakter').max(60),
  client: authClient,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Kata sandi wajib diisi').max(128),
  client: authClient,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const mfaVerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/, 'Kode terdiri dari 6 angka'),
});
export const mfaResendSchema = z.object({ challengeId: z.string().uuid() });

export const verifyEmailSchema = z.object({ token: z.string().trim().min(20).max(200) });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().trim().min(20).max(200), newPassword: newPasswordSchema });

/** `currentPassword` is required when the account already has a password. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: newPasswordSchema,
});

// ───────────── Collections ─────────────
export const createCollectionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(280).nullable().optional(),
  isPublic: z.boolean().default(false),
});
export const updateCollectionSchema = createCollectionSchema.partial();
export const addCollectionItemSchema = z
  .object({
    restaurantId: uuid.optional(),
    googlePlaceId: placeIdSchema.optional(),
    note: z.string().trim().max(200).nullable().optional(),
  })
  .refine((v) => !!v.restaurantId || !!v.googlePlaceId, 'restaurantId atau googlePlaceId wajib diisi');

// ───────────── Restaurants ─────────────
export const resolvePlaceSchema = z.object({ googlePlaceId: placeIdSchema });

/** Indonesia incl. surrounding seas (Sabang–Merauke, Miangas–Rote). Community places must lie inside. */
export const INDONESIA_BOUNDS = { south: -11.2, west: 94.9, north: 6.1, east: 141.05 } as const;
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/** A food place added by a MAM! user (for places missing from OpenStreetMap / Google). */
export const createPlaceSchema = z.object({
  name: z.string().trim().min(3, 'Nama minimal 3 karakter').max(120),
  lat: z.number().min(INDONESIA_BOUNDS.south).max(INDONESIA_BOUNDS.north),
  lng: z.number().min(INDONESIA_BOUNDS.west).max(INDONESIA_BOUNDS.east),
  address: optionalText(300),
  city: optionalText(120),
  categories: z.array(z.enum(CategorySlugs)).min(1, 'Pilih minimal satu kategori').max(3),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+()\s-]*$/, 'Nomor telepon tidak valid')
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  website: z
    .string()
    .trim()
    .max(300)
    .refine((u) => u === '' || /^https?:\/\/[^\s]+$/i.test(u), 'Tautan harus diawali http:// atau https://')
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  openingHours: optionalText(200),
});
export type CreatePlaceInput = z.infer<typeof createPlaceSchema>;

export const placeSubmissionsQuerySchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED']).default('PENDING'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export const placeDecisionSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT']),
    /** Required when rejecting — it is e-mailed to the submitter. */
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.action === 'APPROVE' || (v.reason?.length ?? 0) >= 5, { message: 'Alasan penolakan minimal 5 karakter', path: ['reason'] });
export const platformLinkSubmissionSchema = z.object({
  provider: z.enum(DeliveryProviders),
  url: z
    .string()
    .url()
    .max(500)
    .refine((u) => u.startsWith('https://'), 'Tautan harus HTTPS'),
});

// ───────────── Admin ─────────────
export const adminUsersQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum(Roles).optional(),
  status: z.enum(UserStatuses).optional(),
});
export const adminUpdateUserSchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    role: z.enum(Roles).optional(),
    reason: z.string().trim().min(5).max(500),
  })
  .refine((v) => v.status || v.role, 'status atau role wajib diisi');

export const adminReportsQuerySchema = paginationSchema.extend({
  status: z.enum(ReportStatuses).default('OPEN'),
});
export const adminResolveReportSchema = z.object({
  status: z.enum(['RESOLVED_ACTION_TAKEN', 'RESOLVED_NO_ACTION', 'DISMISSED']),
  reviewAction: z.enum(ModerationActionTypes).optional(),
  note: z.string().trim().min(5).max(1000),
});
export const adminModerateReviewSchema = z.object({
  action: z.enum(ModerationActionTypes),
  reason: z.string().trim().min(5).max(1000),
});
export const adminReviewsQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED', 'DELETED']).optional(),
  q: z.string().trim().max(100).optional(),
});
export const adminAuditQuerySchema = paginationSchema.extend({
  action: z.string().trim().max(80).optional(),
  actorId: uuid.optional(),
});
export const adminRestaurantsQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'MERGED', 'CLOSED', 'HIDDEN']).optional(),
});
export const adminUpdateRestaurantSchema = z.object({
  name: z.string().trim().min(1).max(120).nullable().optional(),
  status: z.enum(['ACTIVE', 'CLOSED', 'HIDDEN']).optional(),
  categories: z.array(z.enum(CategorySlugs)).max(5).optional(),
  reason: z.string().trim().min(5).max(500),
});
export const adminMergeRestaurantSchema = z.object({
  targetRestaurantId: uuid,
  reason: z.string().trim().min(5).max(500),
});
export const adminPlatformLinkSchema = z.object({
  provider: z.enum(DeliveryProviders),
  url: z.string().url().max(500).nullable(),
  availability: z.enum(['VERIFIED', 'UNAVAILABLE']),
  reason: z.string().trim().min(5).max(500),
});
export const adminCategorySchema = z.object({
  nameId: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().min(1).max(40),
  emoji: z.string().trim().max(8).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});
export const adminConfigSchema = z.object({
  defaultRadiusMeters: radiusSchema.optional(),
  reviewMinTextLength: z.number().int().min(1).max(500).optional(),
  reviewsRequireApproval: z.boolean().optional(),
  maxReviewsPerDay: z.number().int().min(1).max(100).optional(),
  reason: z.string().trim().min(5).max(500),
});
