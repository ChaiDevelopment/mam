import type {
  AdminOverview,
  AdminReportRow,
  AdminUserRow,
  ApiErrorBody,
  AuditLogView,
  CollectionItemView,
  CollectionView,
  CommunityStats,
  ExternalReviewsResponse,
  FavoriteView,
  HomeSections,
  IntegrationHealth,
  LeaderboardEntry,
  Me,
  NearbyResponse,
  NotificationView,
  Paginated,
  PlaceDetail,
  PlaceSubmissionView,
  PlaceSummary,
  PlatformLinkView,
  ProviderStatus,
  PublicProfile,
  RestaurantView,
  ReviewPhotoView,
  ReviewView,
  SurpriseResponse,
  ReactionType,
  ReportReason,
  VisitType,
  Role,
} from '@mam/shared-types';

export interface MfaChallenge {
  mfaRequired: true;
  challengeId: string;
  emailHint: string;
  expiresIn: number;
  /** Development only (no SMTP configured). */
  devCode?: string;
}
export type LoginResult = MfaChallenge | { ok?: boolean; mfaRequired?: undefined; user: Me };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | null,
  ) {
    super(body?.message ?? `Permintaan gagal (HTTP ${status})`);
    this.name = 'ApiError';
  }
  get isNetwork() {
    return this.status === 0;
  }
}

export interface ApiClientOptions {
  /** e.g. "/api/v1" (same-origin through Next rewrites) or "http://localhost:4000/api/v1" */
  baseUrl: string;
  /** Custom fetch (tests / SSR). */
  fetchImpl?: typeof fetch;
  /** Extra headers, e.g. forwarded cookies during SSR. */
  headers?: () => Record<string, string>;
  onUnauthorized?: () => void;
}

type Query = Record<string, string | number | boolean | undefined | null | string[]>;

function qs(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(','));
    } else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export const CSRF_COOKIE = 'mam_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

export function createApiClient(opts: ApiClientOptions) {
  const f = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  let refreshing: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      try {
        const res = await f(`${opts.baseUrl}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: readCookie(CSRF_COOKIE) ?? '' },
          body: '{}',
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
    return refreshing;
  }

  async function request<T>(method: string, path: string, body?: unknown, query?: Query, retry = true): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers?.() ?? {}) };
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') {
      const csrf = readCookie(CSRF_COOKIE);
      if (csrf) headers[CSRF_HEADER] = csrf;
    }
    let res: Response;
    try {
      res = await f(`${opts.baseUrl}${path}${qs(query)}`, {
        method,
        headers,
        credentials: 'include',
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, { statusCode: 0, error: 'NetworkError', message: 'Tidak dapat terhubung ke server. Periksa koneksi internet kamu.' });
    }
    if (res.status === 401 && retry && !path.startsWith('/auth/')) {
      if (await refresh()) return request<T>(method, path, body, query, false);
      opts.onUnauthorized?.();
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json = text ? safeJson(text) : null;
    if (!res.ok) throw new ApiError(res.status, (json as ApiErrorBody) ?? null);
    return json as T;
  }

  const get = <T>(p: string, q?: Query) => request<T>('GET', p, undefined, q);
  const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});
  const patch = <T>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {});
  const put = <T>(p: string, b?: unknown) => request<T>('PUT', p, b ?? {});
  const del = <T>(p: string) => request<T>('DELETE', p);

  return {
    request,
    auth: {
      googleStartUrl: (app: 'web' | 'admin', returnTo = '/') =>
        `${opts.baseUrl}/auth/google/start${qs({ app, returnTo })}`,
      me: () => get<Me>('/auth/me'),
      providers: () => get<{ google: boolean; password: boolean; devLogin: boolean }>('/auth/providers'),
      /** Email + password. Web/admin: session cookies are set; ANDROID: tokens are returned. */
      register: (b: { email: string; password: string; displayName: string; client?: 'WEB' | 'ADMIN' | 'ANDROID' }) =>
        post<{ ok?: boolean; user: Me }>('/auth/register', b),
      /** Staff accounts get `{ mfaRequired: true, challengeId, emailHint }` and must call `mfaVerify` with the e-mailed code. */
      login: (b: { email: string; password: string; client?: 'WEB' | 'ADMIN' | 'ANDROID' }) => post<LoginResult>('/auth/login', b),
      mfaVerify: (b: { challengeId: string; code: string }) => post<{ ok?: boolean; user: Me }>('/auth/mfa/verify', b),
      mfaResend: (challengeId: string) => post<MfaChallenge>('/auth/mfa/resend', { challengeId }),
      changePassword: (b: { currentPassword?: string; newPassword: string }) => post<void>('/auth/password', b),
      verifyEmail: (token: string) => post<{ ok: true; email: string }>('/auth/verify-email', { token }),
      resendVerification: () => post<{ ok: true; alreadyVerified?: true }>('/auth/resend-verification'),
      forgotPassword: (email: string) => post<{ ok: true }>('/auth/forgot-password', { email }),
      resetPassword: (token: string, newPassword: string) => post<{ ok: true }>('/auth/reset-password', { token, newPassword }),
      logout: () => post<void>('/auth/logout'),
      refresh,
    },
    users: {
      me: () => get<Me>('/users/me'),
      updateMe: (b: unknown) => patch<Me>('/users/me', b),
      deleteMe: () => request<void>('DELETE', '/users/me', { confirm: 'HAPUS AKUN SAYA' }),
      profile: (idOrUsername: string) => get<PublicProfile>(`/users/${encodeURIComponent(idOrUsername)}`),
      reviews: (idOrUsername: string, page = 1) =>
        get<Paginated<ReviewView>>(`/users/${encodeURIComponent(idOrUsername)}/reviews`, { page }),
      searchHistory: () => get<{ id: string; query: string; createdAt: string }[]>('/users/me/search-history'),
      clearSearchHistory: () => del<void>('/users/me/search-history'),
    },
    places: {
      nearby: (q: Query) => get<NearbyResponse>('/places/nearby', q),
      search: (q: Query) => get<{ items: PlaceSummary[]; providers: ProviderStatus[] }>('/places/search', q),
      autocomplete: (q: Query) =>
        get<{ suggestions: { placeId: string; text: string; secondaryText: string | null }[]; provider: ProviderStatus }>(
          '/places/autocomplete',
          q,
        ),
      geocodePlace: (placeId: string) => get<{ location: { lat: number; lng: number }; label: string }>(`/places/${placeId}/location`),
      detail: (placeId: string, q?: Query) => get<{ place: PlaceDetail; provider: ProviderStatus }>(`/places/${placeId}`, q),
      externalReviews: (placeId: string) => get<ExternalReviewsResponse>(`/places/${placeId}/external-reviews`),
      photoUrl: (name: string, maxWidth = 800) => `${opts.baseUrl}/places/photo${qs({ name, maxWidth })}`,
      surprise: (q: Query) => get<SurpriseResponse>('/places/surprise', q),
      /** Adds a place missing from OpenStreetMap/Google. Throws ApiError 409 (details.placeId) for near-duplicates. */
      create: (b: {
        name: string;
        lat: number;
        lng: number;
        categories: string[];
        address?: string | null;
        city?: string | null;
        phone?: string | null;
        website?: string | null;
        openingHours?: string | null;
      }) => post<PlaceSubmissionView>('/places', b),
      mySubmissions: () => get<PlaceSubmissionView[]>('/places/submissions/mine'),
    },
    home: (q: Query) => get<HomeSections>('/home', q),
    categories: () => get<{ slug: string; nameId: string; nameEn: string; emoji: string | null }[]>('/categories'),
    restaurants: {
      resolve: (googlePlaceId: string) => post<RestaurantView>('/restaurants/resolve', { googlePlaceId }),
      get: (id: string) => get<RestaurantView>(`/restaurants/${id}`),
      reviews: (id: string, q?: Query) => get<Paginated<ReviewView>>(`/restaurants/${id}/reviews`, q),
      statistics: (id: string) => get<CommunityStats>(`/restaurants/${id}/statistics`),
      platformLinks: (id: string) => get<PlatformLinkView[]>(`/restaurants/${id}/platform-links`),
      submitPlatformLink: (id: string, b: { provider: string; url: string }) =>
        post<PlatformLinkView>(`/restaurants/${id}/platform-links`, b),
      myReview: (id: string) => get<ReviewView | null>(`/restaurants/${id}/my-review`),
    },
    reviews: {
      create: (b: {
        restaurantId?: string;
        googlePlaceId?: string;
        ratings: Record<'taste' | 'price' | 'portion' | 'cleanliness' | 'service', number>;
        text: string;
        pricePaid?: number | null;
        visitType: VisitType;
        visitedAt?: string | null;
        photoIds?: string[];
      }) => post<ReviewView>('/reviews', b),
      update: (id: string, b: unknown) => patch<ReviewView>(`/reviews/${id}`, b),
      remove: (id: string) => del<void>(`/reviews/${id}`),
      get: (id: string) => get<ReviewView>(`/reviews/${id}`),
      feed: (q?: Query) => get<Paginated<ReviewView>>('/reviews/feed', q),
      react: (id: string, type: ReactionType) => post<ReviewView['reactions'] & { mine: ReactionType[] }>(`/reviews/${id}/reactions`, { type }),
      unreact: (id: string, type: ReactionType) => del<ReviewView['reactions'] & { mine: ReactionType[] }>(`/reviews/${id}/reactions/${type}`),
      report: (id: string, reason: ReportReason, details?: string) => post<{ id: string }>(`/reviews/${id}/report`, { reason, details }),
    },
    uploads: {
      reviewPhoto: (file: Blob, filename = 'photo.jpg') => {
        const fd = new FormData();
        fd.append('file', file, filename);
        return request<ReviewPhotoView>('POST', '/uploads/review-photo', fd);
      },
      remove: (id: string) => del<void>(`/uploads/${id}`),
    },
    collections: {
      mine: () => get<CollectionView[]>('/collections'),
      get: (id: string) => get<CollectionView & { items: CollectionItemView[] }>(`/collections/${id}`),
      create: (b: { name: string; description?: string | null; isPublic?: boolean }) => post<CollectionView>('/collections', b),
      update: (id: string, b: unknown) => patch<CollectionView>(`/collections/${id}`, b),
      remove: (id: string) => del<void>(`/collections/${id}`),
      addItem: (id: string, b: { restaurantId?: string; googlePlaceId?: string; note?: string | null }) =>
        post<CollectionItemView>(`/collections/${id}/items`, b),
      removeItem: (id: string, itemId: string) => del<void>(`/collections/${id}/items/${itemId}`),
    },
    favorites: {
      list: () => get<FavoriteView[]>('/favorites'),
      add: (restaurantId: string) => post<void>(`/favorites/${restaurantId}`),
      remove: (restaurantId: string) => del<void>(`/favorites/${restaurantId}`),
      status: (restaurantId: string) => get<{ favorited: boolean }>(`/favorites/${restaurantId}`),
    },
    notifications: {
      list: (page = 1) => get<Paginated<NotificationView> & { unread: number }>('/notifications', { page }),
      read: (id: string) => patch<void>(`/notifications/${id}/read`),
      readAll: () => post<void>('/notifications/read-all'),
    },
    community: {
      leaderboard: () => get<LeaderboardEntry[]>('/community/leaderboard'),
    },
    admin: {
      overview: () => get<AdminOverview>('/admin/overview'),
      users: (q?: Query) => get<Paginated<AdminUserRow>>('/admin/users', q),
      user: (id: string) => get<AdminUserRow & { profile: PublicProfile; recentAudit: AuditLogView[] }>(`/admin/users/${id}`),
      updateUser: (id: string, b: { status?: 'ACTIVE' | 'SUSPENDED'; role?: Role; reason: string }) =>
        patch<AdminUserRow>(`/admin/users/${id}`, b),
      placeSubmissions: (q?: Query) => get<Paginated<PlaceSubmissionView>>('/admin/place-submissions', q),
      decidePlace: (id: string, b: { action: 'APPROVE' | 'REJECT'; reason?: string }) =>
        patch<PlaceSubmissionView & { emailed: 'smtp' | 'outbox' | null }>(`/admin/place-submissions/${id}`, b),
      reports: (q?: Query) => get<Paginated<AdminReportRow>>('/admin/reports', q),
      resolveReport: (id: string, b: unknown) => patch<AdminReportRow>(`/admin/reports/${id}`, b),
      reviews: (q?: Query) => get<Paginated<ReviewView>>('/admin/reviews', q),
      moderateReview: (id: string, b: { action: string; reason: string }) => post<ReviewView>(`/admin/reviews/${id}/moderate`, b),
      restaurants: (q?: Query) => get<Paginated<RestaurantView & { externalRefs: { provider: string; externalPlaceId: string }[] }>>('/admin/restaurants', q),
      updateRestaurant: (id: string, b: unknown) => patch<RestaurantView>(`/admin/restaurants/${id}`, b),
      duplicates: () => get<{ a: RestaurantView; b: RestaurantView; distanceMeters: number; reason: string }[]>('/admin/restaurants/duplicates'),
      mergeRestaurant: (id: string, b: { targetRestaurantId: string; reason: string }) => post<RestaurantView>(`/admin/restaurants/${id}/merge`, b),
      setPlatformLink: (id: string, b: unknown) => put<PlatformLinkView>(`/admin/restaurants/${id}/platform-links`, b),
      categories: () => get<{ id: string; slug: string; nameId: string; nameEn: string; emoji: string | null; sortOrder: number; isActive: boolean; restaurantCount: number }[]>('/admin/categories'),
      updateCategory: (id: string, b: unknown) => patch<unknown>(`/admin/categories/${id}`, b),
      auditLogs: (q?: Query) => get<Paginated<AuditLogView>>('/admin/audit-logs', q),
      config: () => get<Record<string, unknown>>('/admin/config'),
      updateConfig: (b: unknown) => patch<Record<string, unknown>>('/admin/config', b),
      integrations: () => get<IntegrationHealth[]>('/admin/integrations'),
      checkIntegrations: () => post<IntegrationHealth[]>('/admin/integrations/check'),
      storage: () => get<{ driver: string; totalFiles: number; totalBytes: number; byMime: { mime: string; files: number; bytes: number }[]; orphanedFiles: number }>('/admin/storage'),
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { statusCode: 0, error: 'InvalidResponse', message: 'Respons server tidak valid' };
  }
}

export type MamApi = ReturnType<typeof createApiClient>;

// ───────────── Formatting helpers (shared by web + admin) ─────────────
const idrFmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
export function formatIdr(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : idrFmt.format(v);
}
export function formatDistance(m: number | null | undefined): string {
  if (m === null || m === undefined) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}
export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', ...opts }).format(new Date(iso));
}
export function formatRating(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : v.toFixed(1).replace('.', ',');
}
