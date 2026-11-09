package id.mam.app.di

import android.content.Context
import id.mam.app.BuildConfig
import id.mam.app.auth.GoogleSignInHelper
import id.mam.app.data.local.EncryptedTokenStore
import id.mam.app.data.local.SettingsStore
import id.mam.app.data.local.TokenStore
import id.mam.app.data.remote.MamApi
import id.mam.app.data.remote.Network
import id.mam.app.data.remote.ServerConfig
import id.mam.app.data.repository.*
import id.mam.app.location.FusedLocationProvider
import id.mam.app.location.LocationProvider

/** Manual dependency injection: one container per process, created in MamApplication. */
interface AppContainer {
    val places: PlacesRepository
    val reviews: ReviewRepository
    val users: UserRepository
    val submissions: SubmissionRepository
    val settings: SettingsRepository
    val location: LocationProvider
    val googleSignIn: GoogleSignInHelper
    val server: ServerConfig
}

class DefaultAppContainer(context: Context) : AppContainer {
    // Must be created before the network stack: it sets the active API server.
    override val server = ServerConfig(context)
    private val tokens: TokenStore = EncryptedTokenStore(context)
    private val api: MamApi = Network.create(BuildConfig.API_BASE_URL, tokens, BuildConfig.DEBUG)
    override val places: PlacesRepository = DefaultPlacesRepository(api, BuildConfig.API_BASE_URL)
    override val reviews: ReviewRepository = DefaultReviewRepository(api)
    override val users: UserRepository = DefaultUserRepository(api, tokens)
    override val submissions: SubmissionRepository = DefaultSubmissionRepository(api)
    override val settings: SettingsRepository = DefaultSettingsRepository(SettingsStore(context))
    override val location: LocationProvider = FusedLocationProvider(context)
    override val googleSignIn = GoogleSignInHelper()
}
