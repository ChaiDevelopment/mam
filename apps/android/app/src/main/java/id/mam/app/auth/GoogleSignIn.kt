package id.mam.app.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import id.mam.app.BuildConfig

sealed interface SignInResult {
    data class Success(val idToken: String) : SignInResult
    data object Cancelled : SignInResult
    data object NotConfigured : SignInResult
    data class Failed(val message: String) : SignInResult
}

/**
 * Native Google sign-in using Credential Manager ("Sign in with Google" button flow).
 * The nonce is issued by the MAM! API (single-use) and verified server-side against the ID token.
 * This authenticates a MAM! account only — it grants no permission to post on Google Maps.
 */
class GoogleSignInHelper {
    suspend fun signIn(activityContext: Context, nonce: String): SignInResult {
        val clientId = BuildConfig.GOOGLE_WEB_CLIENT_ID
        if (clientId.isBlank()) return SignInResult.NotConfigured
        val option = GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        return try {
            val result = CredentialManager.create(activityContext).getCredential(activityContext, request)
            val credential = result.credential
            if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                SignInResult.Success(GoogleIdTokenCredential.createFrom(credential.data).idToken)
            } else {
                SignInResult.Failed("Kredensial tidak dikenali.")
            }
        } catch (e: GetCredentialCancellationException) {
            SignInResult.Cancelled
        } catch (e: NoCredentialException) {
            SignInResult.Failed("Tidak ada akun Google di perangkat ini.")
        } catch (e: GetCredentialException) {
            SignInResult.Failed(e.message ?: "Login Google gagal.")
        }
    }
}
