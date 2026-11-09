package id.mam.app.data.remote

import android.content.Context
import id.mam.app.BuildConfig
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response

/**
 * The API server the app talks to. Release builds always use BuildConfig.API_BASE_URL. Debug builds can point to
 * another server at runtime (e.g. the developer PC's Wi-Fi IP when testing on a real phone — 10.0.2.2 only works
 * in the emulator). Stored in plain SharedPreferences: it is a URL, not a secret.
 */
class ServerConfig(context: Context) {
    private val prefs = context.getSharedPreferences("mam_server", Context.MODE_PRIVATE)

    init {
        active = if (BuildConfig.DEBUG) prefs.getString(KEY, null)?.let(::normalize) ?: BuildConfig.API_BASE_URL else BuildConfig.API_BASE_URL
    }

    val baseUrl: String get() = active
    val isOverridden: Boolean get() = active != BuildConfig.API_BASE_URL

    /** Saves a new server URL (debug builds only). Returns the normalized URL or null when invalid. */
    fun set(input: String): String? {
        if (!BuildConfig.DEBUG) return null
        val url = normalize(input) ?: return null
        prefs.edit().putString(KEY, url).apply()
        active = url
        return url
    }

    fun reset() {
        prefs.edit().remove(KEY).apply()
        active = BuildConfig.API_BASE_URL
    }

    companion object {
        private const val KEY = "api_base_url"

        /** Current API base URL (ends with `/api/v1/`). Read by the network interceptor and image URL helpers. */
        @Volatile var active: String = BuildConfig.API_BASE_URL
            private set

        /** Server origin for relative upload URLs such as `/uploads/...`. */
        val origin: String get() = active.substringBefore("/api/v1")

        /**
         * Accepts "192.168.1.5", "192.168.1.5:4000", "http://192.168.1.5:4000" or a full ".../api/v1/" URL.
         * Defaults: http, port 4000, path /api/v1/.
         */
        fun normalize(input: String): String? {
            var s = input.trim()
            if (s.isEmpty() || s.any { it.isWhitespace() }) return null
            if (s.contains("://") && !s.startsWith("http://") && !s.startsWith("https://")) return null
            if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://$s"
            val parsed = s.toHttpUrlOrNull() ?: return null
            val hasExplicitPort = Regex("""^https?://[^/]+:\d+""").containsMatchIn(s)
            val port = if (hasExplicitPort) parsed.port else if (parsed.scheme == "https") 443 else 4000
            return HttpUrl.Builder().scheme(parsed.scheme).host(parsed.host).port(port).addPathSegments("api/v1/").build().toString()
        }
    }
}

/**
 * Rewrites requests aimed at the build-time server (BuildConfig.API_BASE_URL) to the active server, so the Retrofit
 * instance never has to be rebuilt. Requests to any other host (e.g. a test MockWebServer) are left untouched.
 */
class ServerSelectionInterceptor(private val buildDefault: HttpUrl? = BuildConfig.API_BASE_URL.toHttpUrlOrNull()) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        val def = buildDefault ?: return chain.proceed(req)
        if (req.url.host != def.host || req.url.port != def.port || req.url.scheme != def.scheme) return chain.proceed(req)
        val target = ServerConfig.active.toHttpUrlOrNull() ?: return chain.proceed(req)
        if (req.url.host == target.host && req.url.port == target.port && req.url.scheme == target.scheme) return chain.proceed(req)
        val url = req.url.newBuilder().scheme(target.scheme).host(target.host).port(target.port).build()
        return chain.proceed(req.newBuilder().url(url).build())
    }
}
