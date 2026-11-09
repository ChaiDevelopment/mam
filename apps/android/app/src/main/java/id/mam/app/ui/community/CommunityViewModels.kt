package id.mam.app.ui.community

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import id.mam.app.auth.GoogleSignInHelper
import id.mam.app.auth.SignInResult
import id.mam.app.data.model.FoodCollection
import id.mam.app.data.model.Favorite
import id.mam.app.data.model.LatLngDto
import id.mam.app.data.model.Me
import id.mam.app.data.model.Review
import id.mam.app.data.model.SurpriseResponse
import id.mam.app.data.repository.PlacesRepository
import id.mam.app.data.repository.ReviewRepository
import id.mam.app.data.repository.SettingsRepository
import id.mam.app.data.repository.UserRepository
import id.mam.app.location.LocationProvider
import id.mam.app.location.LocationResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ───────────── Feed ─────────────
data class FeedUiState(val loading: Boolean = true, val items: List<Review> = emptyList(), val error: String? = null, val page: Int = 1, val hasMore: Boolean = false)

class FeedViewModel(private val reviews: ReviewRepository) : ViewModel() {
    private val _state = MutableStateFlow(FeedUiState())
    val state: StateFlow<FeedUiState> = _state.asStateFlow()
    init { refresh() }

    fun refresh() = load(1)
    fun more() { if (state.value.hasMore && !state.value.loading) load(state.value.page + 1) }

    private fun load(page: Int) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            reviews.feed(page)
                .onSuccess { p -> _state.update { it.copy(loading = false, items = if (page == 1) p.items else it.items + p.items, page = page, hasMore = p.hasMore) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }
}

// ───────────── Surprise ─────────────
data class SurpriseUiState(val radius: Int = 5000, val categories: Set<String> = emptySet(), val rolling: Boolean = false, val result: SurpriseResponse? = null, val error: String? = null, val seen: List<String> = emptyList())

class SurpriseViewModel(private val places: PlacesRepository, private val settings: SettingsRepository, private val location: LocationProvider) : ViewModel() {
    private val _state = MutableStateFlow(SurpriseUiState())
    val state: StateFlow<SurpriseUiState> = _state.asStateFlow()
    private var center: LatLngDto? = null

    init { viewModelScope.launch { _state.update { it.copy(radius = settings.radius.first()) } } }

    fun setRadius(r: Int) = _state.update { it.copy(radius = r) }
    fun toggle(c: String) = _state.update { s -> s.copy(categories = if (c in s.categories) s.categories - c else s.categories + c) }

    fun roll() {
        viewModelScope.launch {
            _state.update { it.copy(rolling = true, error = null) }
            val c = center ?: when (val r = location.current()) {
                is LocationResult.Success -> r.location.also { center = it }
                else -> return@launch _state.update { it.copy(rolling = false, error = "Lokasi diperlukan. Izinkan lokasi atau atur area di Beranda.") }
            }
            val s = state.value
            places.surprise(c, s.radius, s.categories.toList(), s.seen)
                .onSuccess { r -> _state.update { it.copy(rolling = false, result = r, seen = it.seen + listOfNotNull(r.pick?.placeId)) } }
                .onFailure { e -> _state.update { it.copy(rolling = false, error = e.message) } }
        }
    }
}

// ───────────── Profile & auth ─────────────
private val EMAIL_REGEX = Regex("""^[^@\s]+@[^@\s]+\.[^@\s]+$""")

data class ProfileUiState(
    val loggedIn: Boolean = false,
    val loading: Boolean = false,
    val me: Me? = null,
    val favorites: List<Favorite> = emptyList(),
    val collections: List<FoodCollection> = emptyList(),
    val unread: Int = 0,
    val message: String? = null,
    /** Staff login: waiting for the e-mailed code. */
    val mfa: id.mam.app.data.model.MfaChallenge? = null,
)

class ProfileViewModel(private val users: UserRepository, private val google: GoogleSignInHelper) : ViewModel() {
    private val _state = MutableStateFlow(ProfileUiState(loggedIn = users.loggedIn.value))
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    init { if (users.loggedIn.value) load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            val me = users.me().getOrElse { e ->
                return@launch _state.update { it.copy(loading = false, loggedIn = users.loggedIn.value, message = e.message) }
            }
            _state.update {
                it.copy(
                    loading = false,
                    loggedIn = true,
                    me = me,
                    favorites = users.favorites().getOrNull().orEmpty(),
                    collections = users.collections().getOrNull().orEmpty(),
                    unread = users.notifications().getOrNull()?.unread ?: 0,
                )
            }
        }
    }

    /** Email + password login (works without Google). Returns early with a local message on invalid input. */
    fun loginWithPassword(email: String, password: String) {
        if (!email.contains('@') || password.isEmpty()) return _state.update { it.copy(message = "Isi email dan kata sandi.") }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, message = null) }
            users.loginWithPassword(email, password)
                .onSuccess { r ->
                    when (r) {
                        is id.mam.app.data.model.LoginOutcome.LoggedIn -> load()
                        is id.mam.app.data.model.LoginOutcome.NeedsCode ->
                            _state.update { it.copy(loading = false, mfa = r.challenge, message = "Kode dikirim ke ${r.challenge.emailHint}.") }
                    }
                }
                .onFailure { e -> _state.update { it.copy(loading = false, message = e.message) } }
        }
    }

    fun verifyCode(code: String) {
        val challenge = _state.value.mfa ?: return
        if (!Regex("^[0-9]{6}$").matches(code.trim())) return _state.update { it.copy(message = "Masukkan 6 angka dari email.") }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, message = null) }
            users.verifyMfa(challenge.challengeId, code)
                .onSuccess { _state.update { it.copy(mfa = null) }; load() }
                .onFailure { e -> _state.update { it.copy(loading = false, message = e.message) } }
        }
    }

    fun resendCode() {
        val challenge = _state.value.mfa ?: return
        viewModelScope.launch {
            users.resendMfa(challenge.challengeId)
                .onSuccess { c -> _state.update { it.copy(mfa = c, message = "Kode baru dikirim ke ${c.emailHint}.") } }
                .onFailure { e -> _state.update { it.copy(message = e.message) } }
        }
    }

    fun cancelMfa() = _state.update { it.copy(mfa = null) }

    fun forgotPassword(email: String) {
        if (!EMAIL_REGEX.matches(email.trim())) return _state.update { it.copy(message = "Masukkan email yang valid.") }
        viewModelScope.launch {
            users.forgotPassword(email)
                .onSuccess { _state.update { it.copy(message = "Kalau email itu terdaftar, tautan atur ulang kata sandi sudah dikirim (berlaku 1 jam).") } }
                .onFailure { e -> _state.update { it.copy(message = e.message) } }
        }
    }

    fun resendVerification() {
        viewModelScope.launch {
            users.resendVerification()
                .onSuccess { already -> _state.update { it.copy(message = if (already) "Email kamu sudah terverifikasi." else "Email verifikasi dikirim ke ${it.me?.email ?: "email kamu"}.") }; if (already) load() }
                .onFailure { e -> _state.update { it.copy(message = e.message) } }
        }
    }

    fun register(email: String, password: String, displayName: String) {
        when {
            displayName.trim().length < 2 -> return _state.update { it.copy(message = "Nama minimal 2 karakter.") }
            !EMAIL_REGEX.matches(email.trim()) -> return _state.update { it.copy(message = "Email tidak valid.") }
            password.length < 8 -> return _state.update { it.copy(message = "Kata sandi minimal 8 karakter.") }
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, message = null) }
            users.register(email, password, displayName)
                .onSuccess { load() }
                .onFailure { e -> _state.update { it.copy(loading = false, message = e.message) } }
        }
    }

    fun signIn(activityContext: Context) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, message = null) }
            val nonce = users.nonce().getOrElse { e -> return@launch _state.update { it.copy(loading = false, message = e.message) } }
            when (val r = google.signIn(activityContext, nonce)) {
                is SignInResult.Success -> users.loginWithGoogle(r.idToken, nonce)
                    .onSuccess { load() }
                    .onFailure { e -> _state.update { it.copy(loading = false, message = e.message) } }
                SignInResult.Cancelled -> _state.update { it.copy(loading = false) }
                SignInResult.NotConfigured -> _state.update { it.copy(loading = false, message = "Login Google belum dikonfigurasi (GOOGLE_WEB_CLIENT_ID).") }
                is SignInResult.Failed -> _state.update { it.copy(loading = false, message = r.message) }
            }
        }
    }

    fun createCollection(name: String) {
        if (name.isBlank()) return
        viewModelScope.launch { users.createCollection(name.trim()).onSuccess { load() }.onFailure { e -> _state.update { it.copy(message = e.message) } } }
    }

    fun logout() {
        viewModelScope.launch {
            users.logout()
            _state.value = ProfileUiState(loggedIn = false)
        }
    }

    fun deleteAccount() {
        viewModelScope.launch {
            users.deleteAccount()
                .onSuccess { _state.value = ProfileUiState(loggedIn = false, message = "Akun dihapus.") }
                .onFailure { e -> _state.update { it.copy(message = e.message) } }
        }
    }

    fun messageShown() = _state.update { it.copy(message = null) }
}
