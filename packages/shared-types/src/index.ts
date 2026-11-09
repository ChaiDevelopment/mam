/**
 * MAM! shared domain types. Consumed by API, web, admin and the API client.
 * Android mirrors these as Kotlin @Serializable classes (apps/android/.../data/model).
 */

// ───────────────────────── Constants ─────────────────────────
export const DEFAULT_RADIUS_METERS = 5000;
export const RADIUS_OPTIONS_METERS = [1000, 2000, 3000, 5000, 10000] as const;
export type RadiusMeters = (typeof RADIUS_OPTIONS_METERS)[number];
export const DEFAULT_TIMEZONE = 'Asia/Jakarta';
export const DEFAULT_CURRENCY = 'IDR';
export const DEFAULT_LOCALE = 'id-ID';

// ───────────────────────── Enums ─────────────────────────
export const Roles = ['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'] as const;
export type Role = (typeof Roles)[number];
export const ROLE_RANK: Record<Role, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

export const UserStatuses = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export type UserStatus = (typeof UserStatuses)[number];

export const ReviewStatuses = ['PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED', 'DELETED'] as const;
export type ReviewStatus = (typeof ReviewStatuses)[number];

export const VisitTypes = ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as const;
export type VisitType = (typeof VisitTypes)[number];

export const ReactionTypes = ['HELPFUL', 'YUMMY', 'FUNNY'] as const;
export type ReactionType = (typeof ReactionTypes)[number];

export const ReportReasons = [
  'SPAM',
  'OFFENSIVE',
  'FAKE_REVIEW',
  'IRRELEVANT',
  'PRIVACY',
  'OTHER',
] as const;
export type ReportReason = (typeof ReportReasons)[number];

export const ReportStatuses = ['OPEN', 'RESOLVED_ACTION_TAKEN', 'RESOLVED_NO_ACTION', 'DISMISSED'] as const;
export type ReportStatus = (typeof ReportStatuses)[number];

export const ModerationActionTypes = ['HIDE', 'REJECT', 'RESTORE', 'PUBLISH', 'DELETE'] as const;
export type ModerationActionType = (typeof ModerationActionTypes)[number];

export const Providers = ['GOOGLE', 'OSM', 'GOFOOD', 'GRABFOOD', 'SHOPEEFOOD', 'MANUAL'] as const;
export type Provider = (typeof Providers)[number];
export const DeliveryProviders = ['GOFOOD', 'GRABFOOD', 'SHOPEEFOOD'] as const;

/** Where a place's data comes from. GOOGLE = live Places API content; OSM = OpenStreetMap (ODbL); COMMUNITY = added by MAM! users. */
export const PlaceSources = ['GOOGLE', 'OSM', 'COMMUNITY'] as const;
export type PlaceSource = (typeof PlaceSources)[number];

/** Places stored in MAM! (OSM imports, community additions) use the key `mam-<restaurant uuid>` instead of a Google Place ID. */
export const LOCAL_PLACE_PREFIX = 'mam-';
/** Localities (cities, towns, villages) used for manual location search: `loc-<uuid>`. */
export const LOCALITY_PREFIX = 'loc-';
export const localPlaceKey = (restaurantId: string) => `${LOCAL_PLACE_PREFIX}${restaurantId}`;
export const parseLocalPlaceKey = (placeId: string): string | null =>
  placeId.startsWith(LOCAL_PLACE_PREFIX) ? placeId.slice(LOCAL_PLACE_PREFIX.length) : null;
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
export type DeliveryProvider = (typeof DeliveryProviders)[number];

/** Availability of data from an external food platform. NOT_INTEGRATED = no authorized API access. */
export const PlatformAvailabilities = ['VERIFIED', 'UNVERIFIED', 'UNAVAILABLE', 'NOT_INTEGRATED'] as const;
export type PlatformAvailability = (typeof PlatformAvailabilities)[number];

export const NotificationTypes = [
  'REVIEW_REACTION',
  'REVIEW_MODERATED',
  'BADGE_EARNED',
  'REPORT_RESOLVED',
  'SYSTEM',
  'PLACE_APPROVED',
  'PLACE_REJECTED',
] as const;
export type NotificationType = (typeof NotificationTypes)[number];

export const LocationVisibilities = ['PUBLIC', 'CITY_ONLY', 'HIDDEN'] as const;
export type LocationVisibility = (typeof LocationVisibilities)[number];

export const BadgeCodes = [
  'FIRST_BITE',
  'FOOD_EXPLORER',
  'HIDDEN_GEM_HUNTER',
  'REVIEW_MASTER',
  'LOCAL_FOODIE',
  'PHOTO_HUNTER',
] as const;
export type BadgeCode = (typeof BadgeCodes)[number];

export const CategorySlugs = [
  'indonesian',
  'japanese',
  'korean',
  'chinese',
  'western',
  'fast-food',
  'street-food',
  'seafood',
  'bakery',
  'dessert',
  'coffee',
  'beverages',
  'vegetarian',
  'other',
] as const;
export type CategorySlug = (typeof CategorySlugs)[number];

export const CATEGORY_LABELS_ID: Record<CategorySlug, string> = {
  indonesian: 'Indonesia',
  japanese: 'Jepang',
  korean: 'Korea',
  chinese: 'Tionghoa',
  western: 'Western',
  'fast-food': 'Cepat Saji',
  'street-food': 'Kaki Lima',
  seafood: 'Seafood',
  bakery: 'Roti & Kue',
  dessert: 'Dessert',
  coffee: 'Kopi',
  beverages: 'Minuman',
  vegetarian: 'Vegetarian',
  other: 'Lainnya',
};

export const BudgetBuckets = ['UNDER_10K', '10K_20K', '20K_30K', '30K_50K', 'ABOVE_50K'] as const;
export type BudgetBucket = (typeof BudgetBuckets)[number];
/** Inclusive min, exclusive max in IDR. */
export const BUDGET_RANGES_IDR: Record<BudgetBucket, { min: number; max: number | null; label: string }> = {
  UNDER_10K: { min: 0, max: 10000, label: 'Di bawah Rp10.000' },
  '10K_20K': { min: 10000, max: 20000, label: 'Rp10.000–Rp20.000' },
  '20K_30K': { min: 20000, max: 30000, label: 'Rp20.000–Rp30.000' },
  '30K_50K': { min: 30000, max: 50000, label: 'Rp30.000–Rp50.000' },
  ABOVE_50K: { min: 50000, max: null, label: 'Di atas Rp50.000' },
};

export const SortOptions = ['NEAREST', 'COMMUNITY_RATING', 'MOST_REVIEWED', 'RECENTLY_REVIEWED'] as const;
export type SortOption = (typeof SortOptions)[number];

/** Where a price/budget figure came from. Sources are never merged into one number. */
export const PriceSources = ['GOOGLE_PRICE_RANGE', 'GOOGLE_PRICE_LEVEL', 'COMMUNITY_REPORTED', 'RESTAURANT_PROVIDED', 'DELIVERY_PLATFORM'] as const;
export type PriceSource = (typeof PriceSources)[number];

export const GooglePriceLevels = [
  'PRICE_LEVEL_FREE',
  'PRICE_LEVEL_INEXPENSIVE',
  'PRICE_LEVEL_MODERATE',
  'PRICE_LEVEL_EXPENSIVE',
  'PRICE_LEVEL_VERY_EXPENSIVE',
] as const;
export type GooglePriceLevel = (typeof GooglePriceLevels)[number];

// ───────────────────────── Common ─────────────────────────
export interface LatLng {
  lat: number;
  lng: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

/** Signals that an upstream provider is unavailable without failing the whole response. */
export interface ProviderStatus {
  provider: Provider;
  ok: boolean;
  reason?: 'NOT_CONFIGURED' | 'UPSTREAM_ERROR' | 'TIMEOUT' | 'QUOTA_EXCEEDED';
  message?: string;
}

// ───────────────────────── Users ─────────────────────────
export interface PublicProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  joinedAt: string;
  stats: { reviewCount: number; photoCount: number; helpfulReceived: number };
  badges: BadgeView[];
}

export interface Me extends PublicProfile {
  email: string;
  emailVerified: boolean;
  role: Role;
  status: UserStatus;
  locationVisibility: LocationVisibility;
  preferences: UserPreferences;
  linkedProviders: string[];
  /** True when email + password login is set up for this account. */
  hasPassword: boolean;
}

export interface UserPreferences {
  defaultRadiusMeters: number;
  preferredCategories: CategorySlug[];
  budget: BudgetBucket | null;
  saveSearchHistory: boolean;
  notificationsEnabled: boolean;
}

export interface BadgeView {
  code: BadgeCode;
  name: string;
  description: string;
  awardedAt: string;
}

// ───────────────────────── Places (Google, transient) ─────────────────────────
export interface GoogleAttribution {
  displayName: string;
  uri?: string;
  photoUri?: string;
}

export interface GooglePhotoRef {
  /** Places API (New) photo resource name, e.g. places/XYZ/photos/ABC. Fetched via our proxy, never stored. */
  name: string;
  widthPx: number;
  heightPx: number;
  authorAttributions: GoogleAttribution[];
}

export interface GooglePlaceInfo {
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: GooglePriceLevel | null;
  priceRange: { min: number | null; max: number | null; currency: string } | null;
  mapsUri: string | null;
}

export interface CommunityStats {
  restaurantId: string;
  reviewCount: number;
  averageOverall: number | null;
  averages: {
    taste: number | null;
    price: number | null;
    portion: number | null;
    cleanliness: number | null;
    service: number | null;
  };
  medianPricePaid: number | null;
  photoCount: number;
  lastReviewedAt: string | null;
}

/** A freely licensed Wikimedia Commons file with the attribution that must be shown next to it. */
export interface MediaCredit {
  url: string;
  thumbUrl: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string | null;
}

/** Chain/brand of a place (OSM brand tags + Wikidata), with optional free logo/photo. */
export interface BrandInfo {
  name: string;
  wikidata: string | null;
  description: string | null;
  website: string | null;
  logo: MediaCredit | null;
  image: MediaCredit | null;
}

/** Facts stored by MAM! for OSM/community places (never Google content). */
export interface LocalPlaceInfo {
  /** Brand/chain when known (e.g. Holland Bakery), with licensed logo/photo when available. */
  brand: BrandInfo | null;
  /** OSM kind such as restaurant, cafe, fast_food, food_court, bakery. */
  kind: string | null;
  cuisine: string[];
  city: string | null;
  province: string | null;
  /** Link to the source object on openstreetmap.org (OSM places only). */
  osmUrl: string | null;
  /** Required attribution text for the data source, e.g. "© OpenStreetMap contributors". */
  attribution: string | null;
}

export interface PlaceSummary {
  /** Google Place ID, or `mam-<uuid>` for places stored in MAM! (see LOCAL_PLACE_PREFIX). */
  placeId: string;
  source: PlaceSource;
  /** Present for OSM/COMMUNITY places. */
  local: LocalPlaceInfo | null;
  /** Internal MAM! restaurant UUID, if this place has been referenced by the community. */
  restaurantId: string | null;
  name: string;
  address: string | null;
  location: LatLng;
  distanceMeters: number | null;
  primaryType: string | null;
  categories: CategorySlug[];
  openNow: boolean | null;
  photo: GooglePhotoRef | null;
  google: GooglePlaceInfo;
  community: Pick<CommunityStats, 'reviewCount' | 'averageOverall' | 'medianPricePaid' | 'lastReviewedAt'> | null;
}

export interface GoogleReview {
  rating: number | null;
  text: string | null;
  originalLanguage: string | null;
  relativePublishTime: string | null;
  publishTime: string | null;
  author: GoogleAttribution;
  /** Link to the review on Google Maps when provided. */
  googleMapsUri: string | null;
}

/** A food place added by a user, as seen by the submitter and by moderators. */
export interface PlaceSubmissionView {
  id: string;
  /** `mam-<uuid>` — opens the place once it is approved. */
  placeId: string;
  name: string;
  address: string | null;
  city: string | null;
  location: LatLng;
  categories: CategorySlug[];
  phone: string | null;
  website: string | null;
  openingHours: string | null;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'HIDDEN' | 'CLOSED' | 'MERGED';
  /** Rejection reason (shown to the submitter and e-mailed). */
  moderationNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  /** Moderator view only. */
  submittedBy?: { userId: string; displayName: string; username: string; email: string } | null;
  /** Moderator view only: other places within 150 m (possible duplicates). */
  nearby?: { placeId: string; name: string; distanceMeters: number; source: PlaceSource }[];
}

export interface PlaceDetail extends PlaceSummary {
  phone: string | null;
  website: string | null;
  openingHours: string[] | null;
  photos: GooglePhotoRef[];
  businessStatus: string | null;
}

export interface NearbyResponse {
  center: LatLng;
  radiusMeters: number;
  items: PlaceSummary[];
  /** All matching places inside the radius (may exceed items.length — request a higher `limit` for more). */
  total: number;
  hasMore: boolean;
  providers: ProviderStatus[];
  /** Number of results removed by budget/rating filters because no data exists for them. */
  excludedForMissingData: number;
}

export interface ExternalReviewsResponse {
  placeId: string;
  /** Google returns at most 5 reviews; this is not the full review set. */
  reviews: GoogleReview[];
  totalOnGoogle: number | null;
  googleMapsUri: string | null;
  writeReviewUri: string | null;
  provider: ProviderStatus;
}

// ───────────────────────── Restaurants / Reviews ─────────────────────────
export interface RestaurantView {
  id: string;
  name: string | null;
  nameSource: 'GOOGLE_LIVE' | 'COMMUNITY' | 'ADMIN' | 'OSM' | 'UNAVAILABLE';
  source: PlaceSource;
  /** Key for /places/:placeId — the Google Place ID or `mam-<uuid>`. */
  placeKey: string | null;
  googlePlaceId: string | null;
  location: LatLng | null;
  categories: CategorySlug[];
  status: 'ACTIVE' | 'MERGED' | 'CLOSED' | 'HIDDEN' | 'PENDING' | 'REJECTED';
  stats: CommunityStats;
}

export interface ReviewPhotoView {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

export interface ReviewView {
  id: string;
  restaurantId: string;
  restaurantName: string | null;
  googlePlaceId: string | null;
  /** Key for /tempat/:placeId — Google Place ID or `mam-<uuid>` (OSM/community places). */
  placeKey: string | null;
  author: { userId: string; username: string; displayName: string; avatarUrl: string | null };
  ratings: {
    taste: number;
    price: number;
    portion: number;
    cleanliness: number;
    service: number;
    overall: number;
  };
  text: string;
  pricePaid: number | null;
  currency: string;
  visitType: VisitType;
  visitedAt: string | null;
  status: ReviewStatus;
  photos: ReviewPhotoView[];
  reactions: Record<ReactionType, number>;
  myReactions: ReactionType[];
  createdAt: string;
  updatedAt: string;
  edited: boolean;
}

// ───────────────────────── Platform links ─────────────────────────
export interface PlatformLinkView {
  provider: DeliveryProvider;
  providerName: string;
  url: string | null;
  availability: PlatformAvailability;
  lastVerifiedAt: string | null;
  source: 'PROVIDER_API' | 'ADMIN_VERIFIED' | 'USER_SUBMITTED' | 'NONE';
  note: string;
}

// ───────────────────────── Collections / favorites ─────────────────────────
export interface CollectionView {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  itemCount: number;
  coverRestaurantId: string | null;
  owner: { userId: string; username: string; displayName: string };
  createdAt: string;
  updatedAt: string;
}

export interface CollectionItemView {
  id: string;
  restaurant: Pick<RestaurantView, 'id' | 'name' | 'googlePlaceId' | 'placeKey' | 'location'>;
  note: string | null;
  addedAt: string;
}

export interface FavoriteView {
  restaurant: Pick<RestaurantView, 'id' | 'name' | 'googlePlaceId' | 'placeKey' | 'location'> & { stats: CommunityStats };
  createdAt: string;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

// ───────────────────────── Surprise me ─────────────────────────
export interface SurpriseReason {
  code: 'WITHIN_RADIUS' | 'CATEGORY_MATCH' | 'BUDGET_MATCH' | 'COMMUNITY_RATING' | 'GOOGLE_RATING' | 'OPEN_NOW' | 'CLOSE_BY' | 'RANDOMIZED';
  text: string;
}

export interface SurpriseResponse {
  pick: PlaceSummary | null;
  score: number | null;
  reasons: SurpriseReason[];
  candidatesConsidered: number;
  providers: ProviderStatus[];
}

// ───────────────────────── Leaderboard / Home ─────────────────────────
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  qualityScore: number;
  reviewCount: number;
  helpfulReceived: number;
}

export interface CommunityPlaceCard {
  restaurant: Pick<RestaurantView, 'id' | 'name' | 'googlePlaceId' | 'placeKey' | 'location' | 'categories'>;
  stats: CommunityStats;
  distanceMeters: number | null;
}

export interface HomeSections {
  trending: CommunityPlaceCard[];
  recentlyReviewed: CommunityPlaceCard[];
  topRated: CommunityPlaceCard[];
  budgetFriendly: CommunityPlaceCard[];
  hiddenGems: CommunityPlaceCard[];
  recentlyDiscovered: CommunityPlaceCard[];
}

// ───────────────────────── Admin ─────────────────────────
export interface AdminOverview {
  totals: {
    users: number;
    activeUsers30d: number;
    publishedReviews: number;
    restaurants: number;
    openReports: number;
    pendingReviews: number;
    /** Community place submissions waiting for a moderator. */
    pendingPlaces: number;
  };
  reviewTrend: { date: string; count: number }[];
  popularCategories: { slug: CategorySlug; reviewCount: number }[];
  recentActivity: AuditLogView[];
}

export interface AuditLogView {
  id: string;
  actor: { userId: string; displayName: string; role: Role } | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface AdminUserRow {
  userId: string;
  email: string;
  username: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  reviewCount: number;
  reportCount: number;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface AdminReportRow {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  reporter: { userId: string; displayName: string };
  review: ReviewView;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface IntegrationHealth {
  provider: Provider | 'REDIS' | 'DATABASE' | 'STORAGE';
  configured: boolean;
  healthy: boolean | null;
  lastCheckedAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  errorCount24h: number;
  successCount24h: number;
  avgLatencyMs: number | null;
  note: string;
}
