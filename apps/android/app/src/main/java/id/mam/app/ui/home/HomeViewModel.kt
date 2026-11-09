package id.mam.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import id.mam.app.data.model.DEFAULT_RADIUS_METERS
import id.mam.app.data.model.LatLngDto
import id.mam.app.data.model.PlaceSummary
import id.mam.app.data.repository.PlacesRepository
import id.mam.app.data.repository.SettingsRepository
import id.mam.app.location.LocationProvider
import id.mam.app.location.LocationResult
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface LocationState {
    data object Idle : LocationState
    data object Requesting : LocationState
    data class Ready(val center: LatLngDto, val label: String, val approximate: Boolean) : LocationState
    data class Problem(val message: String) : LocationState
}

sealed interface ResultsState {
    data object Idle : ResultsState
    data object Loading : ResultsState
    data class Success(val items: List<PlaceSummary>, val notice: String?, val excludedForMissingData: Int, val total: Int = items.size) : ResultsState
    data class Error(val message: String) : ResultsState
}

enum class ViewMode { LIST, MAP }

data class HomeUiState(
    val location: LocationState = LocationState.Idle,
    val radius: Int = DEFAULT_RADIUS_METERS,
    val categories: Set<String> = emptySet(),
    val sort: String = "NEAREST",
    val viewMode: ViewMode = ViewMode.LIST,
    val results: ResultsState = ResultsState.Idle,
    val manualQuery: String = "",
    val manualResults: List<PlaceSummary> = emptyList(),
)

class HomeViewModel(
    private val places: PlacesRepository,
    private val settings: SettingsRepository,
    private val location: LocationProvider,
) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()
    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            val r = settings.radius.first()
            _state.update { it.copy(radius = r) }
            // Only fetch automatically if permission was already granted earlier — never prompt on launch.
            if (location.hasPermission()) locate()
        }
    }

    /** Called after the user grants (or denies) the runtime permission from the UI. */
    fun onPermissionResult(granted: Boolean) {
        if (granted) locate() else _state.update { it.copy(location = LocationState.Problem("Izin lokasi ditolak. Cari area secara manual di bawah.")) }
    }

    fun locate() {
        viewModelScope.launch {
            _state.update { it.copy(location = LocationState.Requesting) }
            when (val r = location.current()) {
                is LocationResult.Success -> {
                    _state.update { it.copy(location = LocationState.Ready(r.location, if (r.approximate) "Lokasi perkiraan" else "Lokasimu saat ini", r.approximate)) }
                    load()
                }
                LocationResult.PermissionDenied -> _state.update { it.copy(location = LocationState.Problem("Izin lokasi ditolak. Cari area secara manual di bawah.")) }
                LocationResult.ServicesDisabled -> _state.update { it.copy(location = LocationState.Problem("GPS/layanan lokasi mati. Aktifkan, atau cari area secara manual.")) }
                LocationResult.Timeout -> _state.update { it.copy(location = LocationState.Problem("Mencari lokasi terlalu lama. Coba lagi atau cari area secara manual.")) }
                LocationResult.Unavailable -> _state.update { it.copy(location = LocationState.Problem("Lokasi tidak tersedia. Cari area secara manual.")) }
            }
        }
    }

    fun setManualCenter(center: LatLngDto, label: String) {
        _state.update { it.copy(location = LocationState.Ready(center, label, approximate = false), manualResults = emptyList(), manualQuery = "") }
        load()
    }

    fun onManualQuery(q: String) {
        _state.update { it.copy(manualQuery = q) }
        if (q.trim().length < 3) return
        viewModelScope.launch {
            places.search(q.trim(), null, DEFAULT_RADIUS_METERS).onSuccess { r -> _state.update { it.copy(manualResults = r.items.take(5)) } }
        }
    }

    fun setRadius(meters: Int) {
        _state.update { it.copy(radius = meters) }
        viewModelScope.launch { settings.setRadius(meters) }
        load()
    }

    fun toggleCategory(slug: String) {
        _state.update { s -> s.copy(categories = if (slug in s.categories) s.categories - slug else s.categories + slug) }
        load()
    }

    fun setSort(sort: String) {
        _state.update { it.copy(sort = sort) }
        load()
    }

    fun setViewMode(mode: ViewMode) = _state.update { it.copy(viewMode = mode) }

    fun load() {
        val loc = state.value.location as? LocationState.Ready ?: return
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.update { it.copy(results = ResultsState.Loading) }
            val s = state.value
            places.nearby(loc.center, s.radius, s.categories.toList(), s.sort)
                .onSuccess { r ->
                    val notice = r.providers.firstOrNull { !it.ok }?.message
                    _state.update { it.copy(results = ResultsState.Success(r.items, notice, r.excludedForMissingData, r.total)) }
                }
                .onFailure { e -> _state.update { it.copy(results = ResultsState.Error(e.message ?: "Gagal memuat.")) } }
        }
    }
}
