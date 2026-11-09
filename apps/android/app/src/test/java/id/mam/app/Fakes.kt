package id.mam.app

import id.mam.app.data.model.*
import id.mam.app.data.remote.AppError
import id.mam.app.data.repository.PlacesRepository
import id.mam.app.data.repository.ReviewRepository
import id.mam.app.data.repository.SettingsRepository
import id.mam.app.location.LocationProvider
import id.mam.app.location.LocationResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

fun place(id: String, distance: Int = 500) = PlaceSummary(placeId = id, name = "Tempat $id", location = LatLngDto(-6.2, 106.8), distanceMeters = distance)

class FakePlaces : PlacesRepository {
    val nearbyCalls = mutableListOf<Triple<LatLngDto, Int, List<String>>>()
    var nearbyResult: Result<NearbyResponse> = Result.success(NearbyResponse(LatLngDto(-6.2, 106.8), 5000, listOf(place("a"), place("b"))))
    var detailResult: Result<PlaceDetailResponse> = Result.success(PlaceDetailResponse(place("a").copy(restaurantId = "r-1"), ProviderStatus("GOOGLE", true)))

    override suspend fun nearby(center: LatLngDto, radius: Int, categories: List<String>, sort: String): Result<NearbyResponse> {
        nearbyCalls += Triple(center, radius, categories)
        return nearbyResult
    }
    override suspend fun search(query: String, center: LatLngDto?, radius: Int) = Result.success(SearchResponse(listOf(place("manual"))))
    override suspend fun detail(placeId: String, center: LatLngDto?) = detailResult
    override suspend fun externalReviews(placeId: String) = Result.success(ExternalReviewsResponse(placeId, provider = ProviderStatus("GOOGLE", true)))
    override suspend fun surprise(center: LatLngDto, radius: Int, categories: List<String>, exclude: List<String>) = Result.success(SurpriseResponse())
    override fun photoUrl(photoName: String, maxWidth: Int) = "http://x/$photoName"
}

class FakeSettings(initial: Int = DEFAULT_RADIUS_METERS) : SettingsRepository {
    val flow = MutableStateFlow(initial)
    override val radius: Flow<Int> = flow
    override suspend fun setRadius(meters: Int) { flow.value = meters }
}

class FakeLocation(var granted: Boolean = false, var result: LocationResult = LocationResult.Success(LatLngDto(-6.2, 106.8), 20f, false)) : LocationProvider {
    var calls = 0
    override fun hasPermission() = granted
    override suspend fun current(): LocationResult { calls++; return if (granted) result else LocationResult.PermissionDenied }
}

class FakeReviews : ReviewRepository {
    var existing: Review? = null
    var createResult: Result<Review>? = null
    val created = mutableListOf<CreateReviewRequest>()
    val updated = mutableListOf<Pair<String, UpdateReviewRequest>>()
    private fun review(id: String = "rev-1") = Review(id, "r-1", author = Author("u", "budi", "Budi"), ratings = Ratings(5, 4, 4, 3, 4, 4.0), text = "x".repeat(30), visitType = "DINE_IN", status = "PUBLISHED", createdAt = "2026-11-01")

    override suspend fun forRestaurant(restaurantId: String, page: Int) = Result.success(Page(listOf<Review>(), 1, 20, 0, false))
    override suspend fun stats(restaurantId: String) = Result.success(CommunityStats(restaurantId, 0))
    override suspend fun platformLinks(restaurantId: String) = Result.success(emptyList<PlatformLink>())
    override suspend fun myReview(restaurantId: String) = Result.success(existing)
    override suspend fun resolve(placeId: String) = Result.success("r-1")
    override suspend fun create(req: CreateReviewRequest): Result<Review> { created += req; return createResult ?: Result.success(review()) }
    override suspend fun update(id: String, req: UpdateReviewRequest): Result<Review> { updated += id to req; return Result.success(review(id)) }
    override suspend fun delete(id: String) = Result.success(Unit)
    override suspend fun feed(page: Int) = Result.success(Page(listOf(review()), 1, 20, 1, false))
    override suspend fun react(id: String, type: String) = Result.success(Unit)
    override suspend fun report(id: String, reason: String) = Result.success(Unit)
    override suspend fun uploadPhoto(bytes: ByteArray, mime: String, filename: String) = Result.success(ReviewPhoto("p-1", "/u/p.webp", "/u/p-thumb.webp"))

    fun conflictOnCreate() { createResult = Result.failure(AppError.Conflict("Kamu sudah pernah mengulas tempat ini.")) }
}
