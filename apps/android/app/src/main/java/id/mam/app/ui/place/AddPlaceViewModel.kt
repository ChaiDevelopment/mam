package id.mam.app.ui.place

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import id.mam.app.data.model.CreatePlaceRequest
import id.mam.app.data.model.LatLngDto
import id.mam.app.data.model.PlaceSubmission
import id.mam.app.data.repository.SubmissionRepository
import id.mam.app.location.LocationProvider
import id.mam.app.location.LocationResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Indonesia incl. surrounding seas — same bounds the API validates. */
private const val SOUTH = -11.2
private const val WEST = 94.9
private const val NORTH = 6.1
private const val EAST = 141.05
private val JAKARTA = LatLngDto(-6.1754, 106.8272)

data class AddPlaceUiState(
    val name: String = "",
    val address: String = "",
    val categories: Set<String> = emptySet(),
    val picked: LatLngDto? = null,
    val mapCenter: LatLngDto = JAKARTA,
    val loading: Boolean = false,
    val message: String? = null,
    val submitted: PlaceSubmission? = null,
    val mine: List<PlaceSubmission> = emptyList(),
)

class AddPlaceViewModel(private val submissions: SubmissionRepository, private val location: LocationProvider) : ViewModel() {
    private val _state = MutableStateFlow(AddPlaceUiState())
    val state: StateFlow<AddPlaceUiState> = _state.asStateFlow()

    init {
        refreshMine()
        viewModelScope.launch {
            if (location.hasPermission()) {
                val r = location.current()
                if (r is LocationResult.Success) _state.update { it.copy(mapCenter = r.location) }
            }
        }
    }

    fun refreshMine() {
        viewModelScope.launch { submissions.mine().onSuccess { list -> _state.update { it.copy(mine = list) } } }
    }

    fun setName(v: String) = _state.update { it.copy(name = v.take(120)) }
    fun setAddress(v: String) = _state.update { it.copy(address = v.take(300)) }
    fun pick(p: LatLngDto) = _state.update { it.copy(picked = LatLngDto(Math.round(p.lat * 1e7) / 1e7, Math.round(p.lng * 1e7) / 1e7)) }
    fun messageShown() = _state.update { it.copy(message = null) }
    fun startAnother() = _state.update { AddPlaceUiState(mapCenter = it.mapCenter, mine = it.mine) }

    fun toggleCategory(slug: String) = _state.update {
        when {
            slug in it.categories -> it.copy(categories = it.categories - slug)
            it.categories.size >= 3 -> it.copy(message = "Maksimal 3 kategori.")
            else -> it.copy(categories = it.categories + slug)
        }
    }

    fun useMyLocation() {
        viewModelScope.launch {
            when (val r = location.current()) {
                is LocationResult.Success -> _state.update { it.copy(mapCenter = r.location) }.also { pick(r.location) }
                else -> _state.update { it.copy(message = "Lokasi tidak tersedia. Ketuk peta untuk memilih titik.") }
            }
        }
    }

    /** Validates locally (same rules as the API) and submits; regular users' places wait for a moderator. */
    fun submit() {
        val s = _state.value
        val p = s.picked
        val problem = when {
            s.name.trim().length < 3 -> "Nama tempat minimal 3 karakter."
            p == null -> "Ketuk peta untuk menandai lokasi tempat."
            p.lat !in SOUTH..NORTH || p.lng !in WEST..EAST -> "Lokasi harus di wilayah Indonesia."
            s.categories.isEmpty() -> "Pilih minimal satu kategori."
            else -> null
        }
        if (problem != null) return _state.update { it.copy(message = problem) }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, message = null) }
            submissions.submit(CreatePlaceRequest(name = s.name.trim(), lat = p!!.lat, lng = p.lng, categories = s.categories.toList(), address = s.address.trim().ifBlank { null }))
                .onSuccess { r -> _state.update { it.copy(loading = false, submitted = r) }; refreshMine() }
                .onFailure { e -> _state.update { it.copy(loading = false, message = e.message) } }
        }
    }
}
