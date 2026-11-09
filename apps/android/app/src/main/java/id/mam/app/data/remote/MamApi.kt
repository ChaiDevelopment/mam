package id.mam.app.data.remote

import id.mam.app.data.model.*
import okhttp3.MultipartBody
import retrofit2.http.*

/** Retrofit definition of the MAM! REST API v1 (see docs/api/API_REFERENCE.md). */
interface MamApi {
    // Auth
    @GET("auth/nonce") suspend fun nonce(): NonceResponse
    @POST("auth/google") suspend fun loginWithGoogle(@Body body: GoogleLoginRequest): TokenResponse
    @POST("auth/login") suspend fun loginWithPassword(@Body body: PasswordLoginRequest): PasswordLoginResponse
    @POST("auth/mfa/verify") suspend fun verifyMfa(@Body body: MfaVerifyRequest): TokenResponse
    @POST("auth/mfa/resend") suspend fun resendMfa(@Body body: MfaResendRequest): PasswordLoginResponse
    @POST("auth/register") suspend fun register(@Body body: RegisterRequest): TokenResponse
    @POST("auth/refresh") suspend fun refresh(@Body body: RefreshRequest): TokenResponse
    @POST("auth/logout") suspend fun logout(@Body body: Map<String, String>)
    @GET("auth/me") suspend fun me(): Me
    @HTTP(method = "DELETE", path = "users/me", hasBody = true) suspend fun deleteAccount(@Body body: DeleteAccountRequest)

    // Discovery (Google, transient)
    @GET("places/nearby")
    suspend fun nearby(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("radius") radius: Int,
        @Query("categories") categories: String? = null,
        @Query("budget") budget: String? = null,
        @Query("sort") sort: String = "NEAREST",
        @Query("openNow") openNow: Boolean? = null,
        @Query("limit") limit: Int = 300,
    ): NearbyResponse

    @GET("places/search") suspend fun search(@Query("q") q: String, @Query("lat") lat: Double?, @Query("lng") lng: Double?, @Query("radius") radius: Int): SearchResponse
    @GET("places/{placeId}") suspend fun placeDetail(@Path("placeId") placeId: String, @Query("lat") lat: Double? = null, @Query("lng") lng: Double? = null): PlaceDetailResponse
    @GET("places/{placeId}/external-reviews") suspend fun externalReviews(@Path("placeId") placeId: String): ExternalReviewsResponse
    @GET("places/surprise")
    suspend fun surprise(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("radius") radius: Int,
        @Query("categories") categories: String? = null,
        @Query("budget") budget: String? = null,
        @Query("excludePlaceIds") exclude: String? = null,
    ): SurpriseResponse

    // Restaurants & reviews (MAM! community)
    @POST("restaurants/resolve") suspend fun resolve(@Body body: ResolveRequest): RestaurantView
    @GET("restaurants/{id}/reviews") suspend fun restaurantReviews(@Path("id") id: String, @Query("page") page: Int = 1, @Query("sort") sort: String = "recent"): Page<Review>
    @GET("restaurants/{id}/statistics") suspend fun statistics(@Path("id") id: String): CommunityStats
    @GET("restaurants/{id}/platform-links") suspend fun platformLinks(@Path("id") id: String): List<PlatformLink>
    @GET("restaurants/{id}/my-review") suspend fun myReview(@Path("id") id: String): Review?

    @POST("reviews") suspend fun createReview(@Body body: CreateReviewRequest): Review
    @POST("places") suspend fun submitPlace(@Body body: CreatePlaceRequest): PlaceSubmission
    @GET("places/submissions/mine") suspend fun mySubmissions(): List<PlaceSubmission>
    @POST("auth/forgot-password") suspend fun forgotPassword(@Body body: EmailRequest): OkResponse
    @POST("auth/resend-verification") suspend fun resendVerification(@Body body: Map<String, String> = emptyMap()): OkResponse
    @PATCH("reviews/{id}") suspend fun updateReview(@Path("id") id: String, @Body body: UpdateReviewRequest): Review
    @DELETE("reviews/{id}") suspend fun deleteReview(@Path("id") id: String)
    @GET("reviews/feed") suspend fun feed(@Query("page") page: Int = 1, @Query("pageSize") pageSize: Int = 20): Page<Review>
    @POST("reviews/{id}/reactions") suspend fun react(@Path("id") id: String, @Body body: ReactionRequest): Map<String, kotlinx.serialization.json.JsonElement>
    @POST("reviews/{id}/report") suspend fun report(@Path("id") id: String, @Body body: ReportRequest)

    @Multipart @POST("uploads/review-photo") suspend fun uploadPhoto(@Part file: MultipartBody.Part): ReviewPhoto

    // Personal
    @GET("favorites") suspend fun favorites(): List<Favorite>
    @POST("favorites/{id}") suspend fun addFavorite(@Path("id") restaurantId: String)
    @DELETE("favorites/{id}") suspend fun removeFavorite(@Path("id") restaurantId: String)
    @GET("collections") suspend fun collections(): List<FoodCollection>
    @POST("collections") suspend fun createCollection(@Body body: CreateCollectionRequest): FoodCollection
    @POST("collections/{id}/items") suspend fun addToCollection(@Path("id") id: String, @Body body: AddItemRequest)
    @GET("notifications") suspend fun notifications(@Query("page") page: Int = 1): NotificationPage
}
