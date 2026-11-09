package id.mam.app.ui.place

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import id.mam.app.data.model.CommunityStats
import id.mam.app.data.model.ExternalReviewsResponse
import id.mam.app.data.model.PlaceSummary
import id.mam.app.data.model.PlatformLink
import id.mam.app.data.model.Review
import id.mam.app.data.remote.AppError
import id.mam.app.data.repository.PlacesRepository
import id.mam.app.data.repository.ReviewRepository
import id.mam.app.data.repository.UserRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PlaceUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val place: PlaceSummary? = null,
    val providerNotice: String? = null,
    val stats: CommunityStats? = null,
    val reviews: List<Review> = emptyList(),
    val google: ExternalReviewsResponse? = null,
    val links: List<PlatformLink> = emptyList(),
    val favorite: Boolean = false,
    val message: String? = null,
)

class PlaceViewModel(
    private val placeId: String,
    private val places: PlacesRepository,
    private val reviews: ReviewRepository,
    private val users: UserRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(PlaceUiState())
    val state: StateFlow<PlaceUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            val detail = places.detail(placeId, null)
            detail.onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
            val d = detail.getOrNull() ?: return@launch
            _state.update { it.copy(loading = false, place = d.place, providerNotice = d.provider.message.takeIf { !d.provider.ok }) }
            // Google reviews and community data load independently; one failing never blocks the other.
            val google = async { places.externalReviews(placeId).getOrNull() }
            val rid = d.place.restaurantId
            if (rid != null) {
                val st = async { reviews.stats(rid).getOrNull() }
                val rv = async { reviews.forRestaurant(rid).getOrNull()?.items.orEmpty() }
                val ln = async { reviews.platformLinks(rid).getOrNull().orEmpty() }
                val fav = async { if (users.loggedIn.value) users.favorites().getOrNull()?.any { it.restaurant.id == rid } == true else false }
                _state.update { it.copy(stats = st.await(), reviews = rv.await(), links = ln.await(), favorite = fav.await()) }
            }
            _state.update { it.copy(google = google.await()) }
        }
    }

    fun toggleFavorite() {
        if (!users.loggedIn.value) return _state.update { it.copy(message = "Masuk dulu untuk menyimpan favorit.") }
        val p = state.value.place ?: return
        val target = !state.value.favorite
        _state.update { it.copy(favorite = target) } // optimistic
        viewModelScope.launch {
            val rid = p.restaurantId ?: reviews.resolve(p.placeId).getOrElse { e -> return@launch rollback(!target, e) }
            users.setFavorite(rid, target)
                .onSuccess { _state.update { it.copy(message = if (target) "Disimpan ke favorit ❤️" else "Dihapus dari favorit") } }
                .onFailure { e -> rollback(!target, e) }
        }
    }

    private fun rollback(previous: Boolean, e: Throwable) {
        _state.update { it.copy(favorite = previous, message = if (e is AppError.Unauthorized) "Sesi berakhir, silakan masuk lagi." else e.message) }
    }

    fun react(reviewId: String) {
        if (!users.loggedIn.value) return _state.update { it.copy(message = "Masuk dulu untuk memberi reaksi.") }
        viewModelScope.launch {
            reviews.react(reviewId, "HELPFUL").onSuccess { load() }.onFailure { e -> _state.update { it.copy(message = e.message) } }
        }
    }

    fun report(reviewId: String, reason: String) {
        viewModelScope.launch {
            reviews.report(reviewId, reason)
                .onSuccess { _state.update { it.copy(message = "Laporan terkirim. Terima kasih!") } }
                .onFailure { e -> _state.update { it.copy(message = e.message) } }
        }
    }

    fun messageShown() = _state.update { it.copy(message = null) }
}
