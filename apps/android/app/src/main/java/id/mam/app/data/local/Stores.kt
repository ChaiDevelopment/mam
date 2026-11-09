package id.mam.app.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import id.mam.app.data.model.DEFAULT_RADIUS_METERS
import id.mam.app.data.model.RADIUS_OPTIONS_METERS
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map

/** Session tokens. Abstracted for tests. */
interface TokenStore {
    val loggedIn: StateFlow<Boolean>
    fun accessToken(): String?
    fun refreshToken(): String?
    fun save(access: String, refresh: String)
    fun clear()
}

/**
 * Tokens encrypted at rest with an Android Keystore-backed key (AES-256-GCM).
 * Excluded from backups (see data_extraction_rules.xml).
 */
class EncryptedTokenStore(context: Context) : TokenStore {
    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "mam_session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
    private val state = MutableStateFlow(prefs.getString(KEY_REFRESH, null) != null)
    override val loggedIn: StateFlow<Boolean> = state

    override fun accessToken(): String? = prefs.getString(KEY_ACCESS, null)
    override fun refreshToken(): String? = prefs.getString(KEY_REFRESH, null)
    override fun save(access: String, refresh: String) {
        prefs.edit().putString(KEY_ACCESS, access).putString(KEY_REFRESH, refresh).apply()
        state.value = true
    }
    override fun clear() {
        prefs.edit().clear().apply()
        state.value = false
    }

    private companion object {
        const val KEY_ACCESS = "access"
        const val KEY_REFRESH = "refresh"
    }
}

private val Context.dataStore by preferencesDataStore(name = "mam_settings")

/** Non-sensitive preferences (DataStore). Location is never persisted. */
class SettingsStore(private val context: Context) {
    private val radiusKey = intPreferencesKey("radius_m")

    val radius: Flow<Int> = context.dataStore.data.map { p ->
        p[radiusKey]?.takeIf { it in RADIUS_OPTIONS_METERS } ?: DEFAULT_RADIUS_METERS
    }

    suspend fun setRadius(meters: Int) {
        require(meters in RADIUS_OPTIONS_METERS) { "Unsupported radius $meters" }
        context.dataStore.edit { it[radiusKey] = meters }
    }
}
