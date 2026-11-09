package id.mam.app.ui.review

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import id.mam.app.data.model.CreateReviewRequest
import id.mam.app.data.model.RatingsInput
import id.mam.app.data.model.ReviewPhoto
import id.mam.app.data.model.UpdateReviewRequest
import id.mam.app.data.remote.AppError
import id.mam.app.data.repository.PlacesRepository
import id.mam.app.data.repository.ReviewRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

const val MIN_TEXT = 20
const val MAX_PHOTOS = 6
const val MAX_UPLOAD_BYTES = 8 * 1024 * 1024
val ALLOWED_MIME = setOf("image/jpeg", "image/png", "image/webp")

data class ReviewForm(
    val taste: Int = 0,
    val price: Int = 0,
    val portion: Int = 0,
    val cleanliness: Int = 0,
    val service: Int = 0,
    val text: String = "",
    val pricePaid: String = "",
    val visitType: String = "DINE_IN",
    val visitedAt: String? = null,
) {
    val ratings get() = listOf(taste, price, portion, cleanliness, service)
    val overall: Double? get() = if (ratings.all { it in 1..5 }) ratings.sum() / 5.0 else null
    fun validationError(): String? = when {
        ratings.any { it !in 1..5 } -> "Beri nilai 1–5 untuk semua aspek."
        text.trim().length < MIN_TEXT -> "Ulasan minimal $MIN_TEXT karakter."
        pricePaid.isNotBlank() && pricePaid.toIntOrNull()?.let { it < 0 } != false -> "Harga tidak valid."
        else -> null
    }
}

data class ReviewFormUiState(
    val loading: Boolean = true,
    val placeName: String = "",
    val existingId: String? = null,
    val form: ReviewForm = ReviewForm(),
    val photos: List<ReviewPhoto> = emptyList(),
    val uploading: Int = 0,
    val saving: Boolean = false,
    val error: String? = null,
    val done: Boolean = false,
)

class ReviewFormViewModel(
    private val placeId: String,
    private val places: PlacesRepository,
    private val reviews: ReviewRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ReviewFormUiState())
    val state: StateFlow<ReviewFormUiState> = _state.asStateFlow()
    private var restaurantId: String? = null

    init { load() }

    private fun load() {
        viewModelScope.launch {
            val d = places.detail(placeId, null).getOrElse { e -> return@launch _state.update { it.copy(loading = false, error = e.message) } }
            restaurantId = d.place.restaurantId
            _state.update { it.copy(placeName = d.place.name) }
            restaurantId?.let { rid ->
                reviews.myReview(rid).getOrNull()?.let { r ->
                    _state.update {
                        it.copy(
                            existingId = r.id,
                            photos = r.photos,
                            form = ReviewForm(r.ratings.taste, r.ratings.price, r.ratings.portion, r.ratings.cleanliness, r.ratings.service, r.text, r.pricePaid?.toString() ?: "", r.visitType, r.visitedAt),
                        )
                    }
                }
            }
            _state.update { it.copy(loading = false) }
        }
    }

    fun update(f: (ReviewForm) -> ReviewForm) = _state.update { it.copy(form = f(it.form), error = null) }

    fun addPhoto(bytes: ByteArray, mime: String, name: String) {
        when {
            state.value.photos.size + state.value.uploading >= MAX_PHOTOS -> return _state.update { it.copy(error = "Maksimal $MAX_PHOTOS foto.") }
            mime !in ALLOWED_MIME -> return _state.update { it.copy(error = "Format harus JPEG, PNG, atau WebP.") }
            bytes.size > MAX_UPLOAD_BYTES -> return _state.update { it.copy(error = "Ukuran foto maksimal 8 MB.") }
        }
        _state.update { it.copy(uploading = it.uploading + 1) }
        viewModelScope.launch {
            reviews.uploadPhoto(bytes, mime, name)
                .onSuccess { p -> _state.update { it.copy(photos = it.photos + p) } }
                .onFailure { e -> _state.update { it.copy(error = e.message) } }
            _state.update { it.copy(uploading = it.uploading - 1) }
        }
    }

    fun removePhoto(id: String) = _state.update { s -> s.copy(photos = s.photos.filterNot { it.id == id }) }

    fun submit() {
        val s = state.value
        s.form.validationError()?.let { return _state.update { it.copy(error = s.form.validationError()) } }
        val f = s.form
        val ratings = RatingsInput(f.taste, f.price, f.portion, f.cleanliness, f.service)
        val price = f.pricePaid.toIntOrNull()
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            val result = if (s.existingId != null) {
                reviews.update(s.existingId, UpdateReviewRequest(ratings, f.text.trim(), price, f.visitType, f.visitedAt, s.photos.map { it.id }))
            } else {
                reviews.create(CreateReviewRequest(restaurantId = restaurantId, googlePlaceId = if (restaurantId == null) placeId else null, ratings = ratings, text = f.text.trim(), pricePaid = price, visitType = f.visitType, visitedAt = f.visitedAt, photoIds = s.photos.map { it.id }))
            }
            result.onSuccess { _state.update { it.copy(saving = false, done = true) } }
                .onFailure { e ->
                    val msg = if (e is AppError.Conflict) "Kamu sudah mengulas tempat ini. Ulasanmu dimuat untuk diedit." else e.message
                    _state.update { it.copy(saving = false, error = msg) }
                    if (e is AppError.Conflict) load()
                }
        }
    }

    fun delete() {
        val id = state.value.existingId ?: return
        viewModelScope.launch {
            reviews.delete(id).onSuccess { _state.update { it.copy(done = true) } }.onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }
}
