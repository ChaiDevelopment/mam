package id.mam.app

import id.mam.app.auth.GoogleSignInHelper
import id.mam.app.data.model.*
import id.mam.app.data.remote.AppError
import id.mam.app.data.repository.UserRepository
import id.mam.app.ui.community.ProfileViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

private val ME = Me(userId = "u-1", username = "ani", displayName = "Ani", email = "ani@contoh.id", role = "USER")

class FakeUsers : UserRepository {
    private val logged = MutableStateFlow(false)
    override val loggedIn: StateFlow<Boolean> = logged
    val logins = mutableListOf<Pair<String, String>>()
    val registrations = mutableListOf<Triple<String, String, String>>()
    var loginResult: Result<Me> = Result.success(ME)
    var requireMfa = false
    val verified = mutableListOf<String>()

    override suspend fun me() = if (logged.value) Result.success(ME) else Result.failure(AppError.Unauthorized())
    override suspend fun nonce() = Result.success("n".repeat(32))
    override suspend fun loginWithGoogle(idToken: String, nonce: String) = Result.success(ME)
    override suspend fun loginWithPassword(email: String, password: String): Result<LoginOutcome> {
        logins += email to password
        if (requireMfa) return Result.success(LoginOutcome.NeedsCode(MfaChallenge("c-1", "mo***@contoh.id")))
        return loginResult.onSuccess { logged.value = true }.map { LoginOutcome.LoggedIn(it) }
    }
    override suspend fun verifyMfa(challengeId: String, code: String): Result<Me> {
        verified += code
        if (code != "123456") return Result.failure(AppError.Server(401, "Kode salah. Sisa percobaan: 4."))
        logged.value = true
        return Result.success(ME)
    }
    override suspend fun resendMfa(challengeId: String) = Result.success(MfaChallenge(challengeId, "mo***@contoh.id"))
    val forgot = mutableListOf<String>()
    override suspend fun forgotPassword(email: String): Result<Unit> { forgot += email; return Result.success(Unit) }
    override suspend fun resendVerification() = Result.success(false)
    override suspend fun register(email: String, password: String, displayName: String): Result<Me> {
        registrations += Triple(email, password, displayName)
        logged.value = true
        return Result.success(ME)
    }
    override suspend fun logout() { logged.value = false }
    override suspend fun deleteAccount() = Result.success(Unit)
    override suspend fun favorites() = Result.success(emptyList<Favorite>())
    override suspend fun setFavorite(restaurantId: String, favorite: Boolean) = Result.success(Unit)
    override suspend fun collections() = Result.success(emptyList<FoodCollection>())
    override suspend fun createCollection(name: String) = Result.failure<FoodCollection>(AppError.Network())
    override suspend fun addToCollection(collectionId: String, placeId: String) = Result.success(Unit)
    override suspend fun notifications() = Result.success(NotificationPage(items = emptyList()))
}

class ProfileViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    @Test fun passwordLoginLoadsTheProfile() {
        val users = FakeUsers()
        val vm = ProfileViewModel(users, GoogleSignInHelper())
        vm.loginWithPassword("ani@contoh.id", "gudeg-enak-1")
        assertEquals(listOf("ani@contoh.id" to "gudeg-enak-1"), users.logins)
        assertTrue(vm.state.value.loggedIn)
        assertEquals("Ani", vm.state.value.me?.displayName)
    }

    @Test fun wrongPasswordShowsTheServerMessageAndStaysLoggedOut() {
        val users = FakeUsers().apply { loginResult = Result.failure(AppError.Server(401, "Email atau kata sandi salah.")) }
        val vm = ProfileViewModel(users, GoogleSignInHelper())
        vm.loginWithPassword("ani@contoh.id", "salah")
        assertFalse(vm.state.value.loggedIn)
        assertEquals("Email atau kata sandi salah.", vm.state.value.message)
    }

    @Test fun registrationValidatesLocallyBeforeCallingTheApi() {
        val users = FakeUsers()
        val vm = ProfileViewModel(users, GoogleSignInHelper())
        vm.register("ani@contoh.id", "pendek", "Ani")
        assertEquals("Kata sandi minimal 8 karakter.", vm.state.value.message)
        vm.register("bukan-email", "cukup-panjang", "Ani")
        assertEquals("Email tidak valid.", vm.state.value.message)
        assertTrue(users.registrations.isEmpty())
        vm.register("ani@contoh.id", "cukup-panjang", "Ani")
        assertEquals(1, users.registrations.size)
        assertTrue(vm.state.value.loggedIn)
    }

    @Test fun staffLoginAsksForTheEmailedCodeBeforeLoggingIn() {
        val users = FakeUsers().apply { requireMfa = true }
        val vm = ProfileViewModel(users, GoogleSignInHelper())
        vm.loginWithPassword("mod@contoh.id", "rahasia-123")
        assertFalse(vm.state.value.loggedIn)
        assertEquals("c-1", vm.state.value.mfa?.challengeId)
        vm.verifyCode("12")
        assertEquals("Masukkan 6 angka dari email.", vm.state.value.message)
        vm.verifyCode("000000")
        assertEquals("Kode salah. Sisa percobaan: 4.", vm.state.value.message)
        assertFalse(vm.state.value.loggedIn)
        vm.verifyCode("123456")
        assertTrue(vm.state.value.loggedIn)
        assertEquals(null, vm.state.value.mfa)
    }

    @Test fun forgotPasswordValidatesEmailAndCallsTheApi() {
        val users = FakeUsers()
        val vm = ProfileViewModel(users, GoogleSignInHelper())
        vm.forgotPassword("bukan-email")
        assertEquals("Masukkan email yang valid.", vm.state.value.message)
        vm.forgotPassword(" ani@contoh.id ")
        assertEquals(listOf(" ani@contoh.id "), users.forgot)
        assertTrue(vm.state.value.message!!.startsWith("Kalau email itu terdaftar"))
    }
}
