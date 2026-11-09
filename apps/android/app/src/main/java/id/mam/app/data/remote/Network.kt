package id.mam.app.data.remote

import id.mam.app.data.local.TokenStore
import id.mam.app.data.model.ApiErrorBody
import id.mam.app.data.model.RefreshRequest
import id.mam.app.data.model.TokenResponse
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.io.IOException
import java.util.concurrent.TimeUnit

val MamJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
}

/** Typed errors surfaced to the UI. */
sealed class AppError(message: String) : Exception(message) {
    class Network : AppError("Tidak ada koneksi internet. Periksa jaringanmu lalu coba lagi.")
    class Unauthorized : AppError("Sesi berakhir. Silakan masuk kembali.")
    class Conflict(message: String) : AppError(message)
    class NotFound(message: String) : AppError(message)
    class RateLimited(message: String) : AppError(message)
    class Server(val status: Int, message: String) : AppError(message)
}

/** Maps transport/HTTP failures to AppError with the server's Indonesian message when available. */
fun Throwable.toAppError(): AppError = when (this) {
    is AppError -> this
    is HttpException -> {
        val body = runCatching { response()?.errorBody()?.string()?.let { MamJson.decodeFromString(ApiErrorBody.serializer(), it) } }.getOrNull()
        val msg = body?.message ?: "Terjadi kesalahan (HTTP ${code()})."
        when (code()) {
            // A 401 from the login endpoint means wrong credentials, not an expired session.
            401 -> if (response()?.raw()?.request?.url?.encodedPath?.let { it.endsWith("/auth/login") || it.endsWith("/auth/mfa/verify") } == true) AppError.Server(401, msg) else AppError.Unauthorized()
            404 -> AppError.NotFound(msg)
            409 -> AppError.Conflict(msg)
            429 -> AppError.RateLimited(msg)
            else -> AppError.Server(code(), msg)
        }
    }
    is IOException -> AppError.Network()
    else -> AppError.Server(0, message ?: "Terjadi kesalahan.")
}

suspend fun <T> apiCall(block: suspend () -> T): Result<T> = try {
    Result.success(block())
} catch (e: Throwable) {
    if (e is kotlinx.coroutines.CancellationException) throw e
    Result.failure(e.toAppError())
}

/** Adds the Bearer access token. Android uses bearer tokens (no cookies → no CSRF surface). */
class AuthInterceptor(private val tokens: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        val token = tokens.accessToken()
        val authed = if (token != null && req.header("Authorization") == null) req.newBuilder().header("Authorization", "Bearer $token").build() else req
        return chain.proceed(authed)
    }
}

/**
 * On 401, rotates the refresh token once (synchronized) and retries. If refresh fails, tokens are cleared.
 * Uses a bare OkHttp client to avoid recursion through this authenticator.
 */
class TokenRefreshAuthenticator(private val baseUrl: String, private val tokens: TokenStore, private val bare: OkHttpClient) : Authenticator {
    private val lock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.url.encodedPath.contains("/auth/")) return null
        if (responseCount(response) >= 2) return null
        synchronized(lock) {
            val current = tokens.accessToken()
            val sent = response.request.header("Authorization")?.removePrefix("Bearer ")
            // Another thread already refreshed.
            if (current != null && current != sent) return response.request.newBuilder().header("Authorization", "Bearer $current").build()
            val refresh = tokens.refreshToken() ?: return null
            val body = MamJson.encodeToString(RefreshRequest.serializer(), RefreshRequest(refresh)).toRequestBody("application/json".toMediaType())
            val res = runCatching { bare.newCall(Request.Builder().url("${baseUrl}auth/refresh").post(body).build()).execute() }.getOrNull()
            res.use { r ->
                if (r == null || !r.isSuccessful) {
                    if (r != null && r.code in 400..499) tokens.clear()
                    return null
                }
                val t = MamJson.decodeFromString(TokenResponse.serializer(), r.body!!.string())
                tokens.save(t.accessToken, t.refreshToken)
                return response.request.newBuilder().header("Authorization", "Bearer ${t.accessToken}").build()
            }
        }
    }

    private fun responseCount(r: Response): Int {
        var n = 1
        var p = r.priorResponse
        while (p != null) { n++; p = p.priorResponse }
        return n
    }
}

object Network {
    fun create(baseUrl: String, tokens: TokenStore, debug: Boolean): MamApi {
        val bare = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS)
            .addInterceptor(ServerSelectionInterceptor())
            .build()
        val client = bare.newBuilder()
            .addInterceptor(AuthInterceptor(tokens))
            .authenticator(TokenRefreshAuthenticator(baseUrl, tokens, bare))
            .apply {
                if (debug) addInterceptor(HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BASIC
                    redactHeader("Authorization")
                })
            }
            .build()
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(MamJson.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(MamApi::class.java)
    }
}
