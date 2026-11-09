package id.mam.app.data.model

import kotlinx.serialization.Serializable

/** Kotlin mirrors of packages/shared-types (subset used by the Android client). */

const val DEFAULT_RADIUS_METERS = 5000
val RADIUS_OPTIONS_METERS = listOf(1000, 2000, 3000, 5000, 10000)

@Serializable data class LatLngDto(val lat: Double, val lng: Double)

@Serializable data class ProviderStatus(val provider: String, val ok: Boolean, val reason: String? = null, val message: String? = null)

@Serializable data class GoogleAttribution(val displayName: String, val uri: String? = null, val photoUri: String? = null)

@Serializable data class GooglePhotoRef(val name: String, val widthPx: Int = 0, val heightPx: Int = 0, val authorAttributions: List<GoogleAttribution> = emptyList())

@Serializable data class PriceRange(val min: Int? = null, val max: Int? = null, val currency: String = "IDR")

@Serializable data class GooglePlaceInfo(
    val rating: Double? = null,
    val userRatingCount: Int? = null,
    val priceLevel: String? = null,
    val priceRange: PriceRange? = null,
    val mapsUri: String? = null,
)

@Serializable data class CommunitySummary(
    val reviewCount: Int = 0,
    val averageOverall: Double? = null,
    val medianPricePaid: Int? = null,
    val lastReviewedAt: String? = null,
)

/** Freely licensed Wikimedia Commons file + the attribution that must be shown with it. */
@Serializable data class MediaCredit(
    val url: String,
    val thumbUrl: String,
    val author: String,
    val license: String,
    val licenseUrl: String? = null,
    val sourceUrl: String? = null,
)

/** Absolute URL for display: files stored by MAM! come back as "/api/v1/uploads/..." (relative to the API). */
val MediaCredit.displayUrl: String get() = if (thumbUrl.startsWith("/")) id.mam.app.data.remote.ServerConfig.origin + thumbUrl else thumbUrl
val MediaCredit.isOwnerPermission: Boolean get() = license == "Izin pemilik merek"

@Serializable data class BrandInfo(
    val name: String,
    val wikidata: String? = null,
    val description: String? = null,
    val website: String? = null,
    val logo: MediaCredit? = null,
    val image: MediaCredit? = null,
)

/** Facts MAM! stores for OpenStreetMap / community places (never Google content). */
@Serializable data class LocalPlaceInfo(
    val brand: BrandInfo? = null,
    val kind: String? = null,
    val cuisine: List<String> = emptyList(),
    val city: String? = null,
    val province: String? = null,
    val osmUrl: String? = null,
    val attribution: String? = null,
)

@Serializable data class PlaceSummary(
    /** Google Place ID, or `mam-<uuid>` for OpenStreetMap / community places. */
    val placeId: String,
    /** GOOGLE, OSM or COMMUNITY. */
    val source: String = "GOOGLE",
    val local: LocalPlaceInfo? = null,
    val restaurantId: String? = null,
    val name: String,
    val address: String? = null,
    val location: LatLngDto,
    val distanceMeters: Int? = null,
    val primaryType: String? = null,
    val categories: List<String> = emptyList(),
    val openNow: Boolean? = null,
    val photo: GooglePhotoRef? = null,
    val google: GooglePlaceInfo = GooglePlaceInfo(),
    val community: CommunitySummary? = null,
    // detail-only fields
    val phone: String? = null,
    val website: String? = null,
    val openingHours: List<String>? = null,
    val photos: List<GooglePhotoRef> = emptyList(),
    val businessStatus: String? = null,
)

@Serializable data class NearbyResponse(
    val center: LatLngDto,
    val radiusMeters: Int,
    val items: List<PlaceSummary>,
    /** All matching places in the radius (the response holds the nearest `limit`). */
    val total: Int = items.size,
    val hasMore: Boolean = false,
    val providers: List<ProviderStatus> = emptyList(),
    val excludedForMissingData: Int = 0,
)

@Serializable data class SearchResponse(val items: List<PlaceSummary>, val providers: List<ProviderStatus> = emptyList())

val PlaceSummary.isGoogle: Boolean get() = source == "GOOGLE"
const val OSM_ATTRIBUTION = "© OpenStreetMap contributors"

@Serializable data class PlaceDetailResponse(val place: PlaceSummary, val provider: ProviderStatus)

@Serializable data class GoogleReview(
    val rating: Double? = null,
    val text: String? = null,
    val relativePublishTime: String? = null,
    val author: GoogleAttribution,
    val googleMapsUri: String? = null,
)

@Serializable data class ExternalReviewsResponse(
    val placeId: String,
    val reviews: List<GoogleReview> = emptyList(),
    val totalOnGoogle: Int? = null,
    val googleMapsUri: String? = null,
    val writeReviewUri: String? = null,
    val provider: ProviderStatus,
)

@Serializable data class SurpriseReason(val code: String, val text: String)

@Serializable data class SurpriseResponse(
    val pick: PlaceSummary? = null,
    val score: Double? = null,
    val reasons: List<SurpriseReason> = emptyList(),
    val candidatesConsidered: Int = 0,
    val providers: List<ProviderStatus> = emptyList(),
)

@Serializable data class Ratings(val taste: Int, val price: Int, val portion: Int, val cleanliness: Int, val service: Int, val overall: Double = 0.0)

@Serializable data class Author(val userId: String, val username: String, val displayName: String, val avatarUrl: String? = null)

@Serializable data class ReviewPhoto(val id: String, val url: String, val thumbUrl: String, val width: Int = 0, val height: Int = 0)

@Serializable data class Review(
    val id: String,
    val restaurantId: String,
    val restaurantName: String? = null,
    val googlePlaceId: String? = null,
    /** Route key for the place screen (Google Place ID or `mam-<uuid>`). */
    val placeKey: String? = null,
    val author: Author,
    val ratings: Ratings,
    val text: String,
    val pricePaid: Int? = null,
    val currency: String = "IDR",
    val visitType: String,
    val visitedAt: String? = null,
    val status: String,
    val photos: List<ReviewPhoto> = emptyList(),
    val reactions: Map<String, Int> = emptyMap(),
    val myReactions: List<String> = emptyList(),
    val createdAt: String,
    val edited: Boolean = false,
)

@Serializable data class Page<T>(val items: List<T>, val page: Int, val pageSize: Int, val total: Int, val hasMore: Boolean)

@Serializable data class CommunityStats(
    val restaurantId: String,
    val reviewCount: Int,
    val averageOverall: Double? = null,
    val medianPricePaid: Int? = null,
    val photoCount: Int = 0,
)

@Serializable data class RestaurantRef(val id: String, val name: String? = null, val googlePlaceId: String? = null, val location: LatLngDto? = null)

@Serializable data class RestaurantView(val id: String, val name: String? = null, val googlePlaceId: String? = null, val stats: CommunityStats)

@Serializable data class PlatformLink(
    val provider: String,
    val providerName: String,
    val url: String? = null,
    val availability: String,
    val lastVerifiedAt: String? = null,
    val source: String,
    val note: String,
)

@Serializable data class Favorite(val restaurant: FavoriteRestaurant, val createdAt: String)
@Serializable data class FavoriteRestaurant(val id: String, val name: String? = null, val googlePlaceId: String? = null, val placeKey: String? = null, val stats: CommunityStats) {
    /** Route key for the place screen (Google Place ID or `mam-<uuid>`). */
    val routeKey: String? get() = placeKey ?: googlePlaceId
}

@Serializable data class FoodCollection(val id: String, val name: String, val description: String? = null, val isPublic: Boolean = false, val itemCount: Int = 0)

@Serializable data class Badge(val code: String, val name: String, val description: String)

@Serializable data class UserStats(val reviewCount: Int = 0, val photoCount: Int = 0, val helpfulReceived: Int = 0)

@Serializable data class Me(
    val userId: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val bio: String? = null,
    val email: String,
    val role: String,
    /** Defaults to true so older API responses never show the verification banner by mistake. */
    val emailVerified: Boolean = true,
    val hasPassword: Boolean = false,
    val stats: UserStats = UserStats(),
    val badges: List<Badge> = emptyList(),
)

@Serializable data class NotificationItem(val id: String, val type: String, val title: String, val body: String, val link: String? = null, val readAt: String? = null, val createdAt: String)
@Serializable data class NotificationPage(val items: List<NotificationItem>, val unread: Int = 0, val total: Int = 0, val hasMore: Boolean = false, val page: Int = 1, val pageSize: Int = 20)

// ───────── Requests ─────────
@Serializable data class NonceResponse(val nonce: String, val expiresIn: Int)
@Serializable data class GoogleLoginRequest(val idToken: String, val nonce: String)
/** `client` has no default on purpose: kotlinx.serialization omits defaults, and the API must see ANDROID to return tokens. */
@Serializable data class PasswordLoginRequest(val email: String, val password: String, val client: String)
@Serializable data class RegisterRequest(val email: String, val password: String, val displayName: String, val client: String)
/** Password login answer: tokens, or (staff accounts) an MFA challenge — a 6-digit code was e-mailed. */
@Serializable data class PasswordLoginResponse(
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val user: Me? = null,
    val mfaRequired: Boolean = false,
    val challengeId: String? = null,
    val emailHint: String? = null,
    val devCode: String? = null,
)
@Serializable data class MfaVerifyRequest(val challengeId: String, val code: String)
@Serializable data class MfaResendRequest(val challengeId: String)
data class MfaChallenge(val challengeId: String, val emailHint: String, val devCode: String? = null)
sealed interface LoginOutcome {
    data class LoggedIn(val me: Me) : LoginOutcome
    data class NeedsCode(val challenge: MfaChallenge) : LoginOutcome
}
@Serializable data class RefreshRequest(val refreshToken: String)
@Serializable data class TokenResponse(val accessToken: String, val refreshToken: String, val expiresIn: Int, val user: Me? = null)
@Serializable data class RatingsInput(val taste: Int, val price: Int, val portion: Int, val cleanliness: Int, val service: Int)
@Serializable data class CreateReviewRequest(
    val restaurantId: String? = null,
    val googlePlaceId: String? = null,
    val ratings: RatingsInput,
    val text: String,
    val pricePaid: Int? = null,
    val visitType: String,
    val visitedAt: String? = null,
    val photoIds: List<String> = emptyList(),
)
@Serializable data class UpdateReviewRequest(
    val ratings: RatingsInput,
    val text: String,
    val pricePaid: Int? = null,
    val visitType: String,
    val visitedAt: String? = null,
    val photoIds: List<String> = emptyList(),
)
@Serializable data class ReactionRequest(val type: String)
@Serializable data class ReportRequest(val reason: String, val details: String? = null)
@Serializable data class ResolveRequest(val googlePlaceId: String)
@Serializable data class CreateCollectionRequest(val name: String, val isPublic: Boolean = false)
@Serializable data class AddItemRequest(val restaurantId: String? = null, val googlePlaceId: String? = null)
@Serializable data class DeleteAccountRequest(val confirm: String = "HAPUS AKUN SAYA")

@Serializable data class ApiErrorBody(val statusCode: Int = 0, val error: String? = null, val message: String? = null)

// ───────── Place submissions & account e-mail flows ─────────
@Serializable data class CreatePlaceRequest(
    val name: String,
    val lat: Double,
    val lng: Double,
    val categories: List<String>,
    val address: String? = null,
)
@Serializable data class PlaceSubmission(
    val id: String,
    val placeId: String,
    val name: String,
    val address: String? = null,
    val city: String? = null,
    val location: LatLngDto,
    val categories: List<String> = emptyList(),
    /** PENDING, ACTIVE (approved) or REJECTED. */
    val status: String,
    val moderationNote: String? = null,
    val createdAt: String,
)
@Serializable data class EmailRequest(val email: String)
@Serializable data class OkResponse(val ok: Boolean = true, val alreadyVerified: Boolean? = null)
