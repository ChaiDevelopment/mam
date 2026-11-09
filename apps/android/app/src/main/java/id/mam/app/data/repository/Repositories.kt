package id.mam.app.data.repository

import id.mam.app.data.local.SettingsStore
import id.mam.app.data.local.TokenStore
import id.mam.app.data.model.*
import id.mam.app.data.remote.AppError
import id.mam.app.data.remote.MamApi
import id.mam.app.data.remote.MamJson
import id.mam.app.data.remote.apiCall
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

interface PlacesRepository {
    suspend fun nearby(center: LatLngDto, radius: Int, categories: List<String> = emptyList(), sort: String = "NEAREST"): Result<NearbyResponse>
    suspend fun search(query: String, center: LatLngDto?, radius: Int): Result<SearchResponse>
    suspend fun detail(placeId: String, center: LatLngDto?): Result<PlaceDetailResponse>
    suspend fun externalReviews(placeId: String): Result<ExternalReviewsResponse>
    suspend fun surprise(center: LatLngDto, radius: Int, categories: List<String>, exclude: List<String>): Result<SurpriseResponse>
    fun photoUrl(photoName: String, maxWidth: Int = 800): String
}

class DefaultPlacesRepository(private val api: MamApi, private val baseUrl: String) : PlacesRepository {
    override suspend fun nearby(center: LatLngDto, radius: Int, categories: List<String>, sort: String) =
        apiCall { api.nearby(center.lat, center.lng, radius, categories.takeIf { it.isNotEmpty() }?.joinToString(","), sort = sort) }
    override suspend fun search(query: String, center: LatLngDto?, radius: Int) = apiCall { api.search(query, center?.lat, center?.lng, radius) }
    override suspend fun detail(placeId: String, center: LatLngDto?) = apiCall { api.placeDetail(placeId, center?.lat, center?.lng) }
    override suspend fun externalReviews(placeId: String) = apiCall { api.externalReviews(placeId) }
    override suspend fun surprise(center: LatLngDto, radius: Int, categories: List<String>, exclude: List<String>) =
        apiCall { api.surprise(center.lat, center.lng, radius, categories.takeIf { it.isNotEmpty() }?.joinToString(","), exclude = exclude.takeLast(30).takeIf { it.isNotEmpty() }?.joinToString(",")) }
    override fun photoUrl(photoName: String, maxWidth: Int) = "${id.mam.app.data.remote.ServerConfig.active}places/photo?name=${java.net.URLEncoder.encode(photoName, "UTF-8")}&maxWidth=$maxWidth"
}

interface ReviewRepository {
    suspend fun forRestaurant(restaurantId: String, page: Int = 1): Result<Page<Review>>
    suspend fun stats(restaurantId: String): Result<CommunityStats>
    suspend fun platformLinks(restaurantId: String): Result<List<PlatformLink>>
    suspend fun myReview(restaurantId: String): Result<Review?>
    suspend fun resolve(placeId: String): Result<String>
    suspend fun create(req: CreateReviewRequest): Result<Review>
    suspend fun update(id: String, req: UpdateReviewRequest): Result<Review>
    suspend fun delete(id: String): Result<Unit>
    suspend fun feed(page: Int): Result<Page<Review>>
    suspend fun react(id: String, type: String): Result<Unit>
    suspend fun report(id: String, reason: String): Result<Unit>
    suspend fun uploadPhoto(bytes: ByteArray, mime: String, filename: String): Result<ReviewPhoto>
}

class DefaultReviewRepository(private val api: MamApi) : ReviewRepository {
    override suspend fun forRestaurant(restaurantId: String, page: Int) = apiCall { api.restaurantReviews(restaurantId, page) }
    override suspend fun stats(restaurantId: String) = apiCall { api.statistics(restaurantId) }
    override suspend fun platformLinks(restaurantId: String) = apiCall { api.platformLinks(restaurantId) }
    override suspend fun myReview(restaurantId: String): Result<Review?> = apiCall {
        try {
            api.myReview(restaurantId)
        } catch (e: kotlinx.serialization.SerializationException) {
            null // API returns an empty body when the user has no review yet
        } catch (e: java.io.EOFException) {
            null
        }
    }
    override suspend fun resolve(placeId: String) = apiCall { api.resolve(ResolveRequest(placeId)).id }
    override suspend fun create(req: CreateReviewRequest) = apiCall { api.createReview(req) }
    override suspend fun update(id: String, req: UpdateReviewRequest) = apiCall { api.updateReview(id, req) }
    override suspend fun delete(id: String) = apiCall { api.deleteReview(id) }
    override suspend fun feed(page: Int) = apiCall { api.feed(page) }
    override suspend fun react(id: String, type: String) = apiCall { api.react(id, ReactionRequest(type)); Unit }
    override suspend fun report(id: String, reason: String) = apiCall { api.report(id, ReportRequest(reason)) }
    override suspend fun uploadPhoto(bytes: ByteArray, mime: String, filename: String) = apiCall {
        val part = MultipartBody.Part.createFormData("file", filename, bytes.toRequestBody(mime.toMediaType()))
        api.uploadPhoto(part)
    }
}

interface UserRepository {
    val loggedIn: StateFlow<Boolean>
    suspend fun me(): Result<Me>
    suspend fun nonce(): Result<String>
    suspend fun loginWithGoogle(idToken: String, nonce: String): Result<Me>
    suspend fun loginWithPassword(email: String, password: String): Result<LoginOutcome>
    suspend fun verifyMfa(challengeId: String, code: String): Result<Me>
    suspend fun resendMfa(challengeId: String): Result<MfaChallenge>
    suspend fun forgotPassword(email: String): Result<Unit>
    suspend fun resendVerification(): Result<Boolean>
    suspend fun register(email: String, password: String, displayName: String): Result<Me>
    suspend fun logout()
    suspend fun deleteAccount(): Result<Unit>
    suspend fun favorites(): Result<List<Favorite>>
    suspend fun setFavorite(restaurantId: String, favorite: Boolean): Result<Unit>
    suspend fun collections(): Result<List<FoodCollection>>
    suspend fun createCollection(name: String): Result<FoodCollection>
    suspend fun addToCollection(collectionId: String, placeId: String): Result<Unit>
    suspend fun notifications(): Result<NotificationPage>
}

class DefaultUserRepository(private val api: MamApi, private val tokens: TokenStore) : UserRepository {
    override val loggedIn: StateFlow<Boolean> = tokens.loggedIn
    override suspend fun me() = apiCall { api.me() }
    override suspend fun nonce() = apiCall { api.nonce().nonce }
    override suspend fun loginWithGoogle(idToken: String, nonce: String) = apiCall {
        val t = api.loginWithGoogle(GoogleLoginRequest(idToken, nonce))
        tokens.save(t.accessToken, t.refreshToken)
        t.user ?: api.me()
    }
    override suspend fun loginWithPassword(email: String, password: String): Result<LoginOutcome> = apiCall {
        val r = api.loginWithPassword(PasswordLoginRequest(email.trim().lowercase(), password, "ANDROID"))
        if (r.mfaRequired && r.challengeId != null) {
            LoginOutcome.NeedsCode(MfaChallenge(r.challengeId, r.emailHint ?: "", r.devCode))
        } else {
            tokens.save(r.accessToken!!, r.refreshToken!!)
            LoginOutcome.LoggedIn(r.user ?: api.me())
        }
    }
    override suspend fun verifyMfa(challengeId: String, code: String) = apiCall {
        val t = api.verifyMfa(MfaVerifyRequest(challengeId, code.trim()))
        tokens.save(t.accessToken, t.refreshToken)
        t.user ?: api.me()
    }
    override suspend fun forgotPassword(email: String) = apiCall { api.forgotPassword(EmailRequest(email.trim().lowercase())); Unit }
    /** Returns true when the address was already verified. */
    override suspend fun resendVerification() = apiCall { api.resendVerification().alreadyVerified == true }
    override suspend fun resendMfa(challengeId: String) = apiCall {
        val r = api.resendMfa(MfaResendRequest(challengeId))
        MfaChallenge(r.challengeId ?: challengeId, r.emailHint ?: "", r.devCode)
    }
    override suspend fun register(email: String, password: String, displayName: String) = apiCall {
        val t = api.register(RegisterRequest(email.trim().lowercase(), password, displayName.trim(), "ANDROID"))
        tokens.save(t.accessToken, t.refreshToken)
        t.user ?: api.me()
    }
    override suspend fun logout() {
        val rt = tokens.refreshToken()
        apiCall { api.logout(if (rt != null) mapOf("refreshToken" to rt) else emptyMap()) }
        tokens.clear()
    }
    override suspend fun deleteAccount() = apiCall { api.deleteAccount(DeleteAccountRequest()) }.onSuccess { tokens.clear() }
    override suspend fun favorites() = apiCall { api.favorites() }
    override suspend fun setFavorite(restaurantId: String, favorite: Boolean) = apiCall { if (favorite) api.addFavorite(restaurantId) else api.removeFavorite(restaurantId) }
    override suspend fun collections() = apiCall { api.collections() }
    override suspend fun createCollection(name: String) = apiCall { api.createCollection(CreateCollectionRequest(name)) }
    override suspend fun addToCollection(collectionId: String, placeId: String) = apiCall { api.addToCollection(collectionId, AddItemRequest(googlePlaceId = placeId)) }
    override suspend fun notifications() = apiCall { api.notifications() }
}

interface SettingsRepository {
    val radius: Flow<Int>
    suspend fun setRadius(meters: Int)
}

class DefaultSettingsRepository(private val store: SettingsStore) : SettingsRepository {
    override val radius: Flow<Int> = store.radius
    override suspend fun setRadius(meters: Int) = store.setRadius(meters)
}

@Suppress("unused")
private fun keepJson() = MamJson // referenced so R8 keeps the configured instance
@Suppress("unused")
private fun keepErrors(): AppError = AppError.Network()

/** Places added by the user (moderated). */
interface SubmissionRepository {
    suspend fun submit(body: CreatePlaceRequest): Result<PlaceSubmission>
    suspend fun mine(): Result<List<PlaceSubmission>>
}

class DefaultSubmissionRepository(private val api: MamApi) : SubmissionRepository {
    override suspend fun submit(body: CreatePlaceRequest) = apiCall { api.submitPlace(body) }
    override suspend fun mine() = apiCall { api.mySubmissions() }
}
