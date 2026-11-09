package id.mam.app.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import id.mam.app.data.model.LatLngDto
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

sealed interface LocationResult {
    data class Success(val location: LatLngDto, val accuracyMeters: Float, val approximate: Boolean) : LocationResult
    data object PermissionDenied : LocationResult
    data object ServicesDisabled : LocationResult
    data object Timeout : LocationResult
    data object Unavailable : LocationResult
}

interface LocationProvider {
    fun hasPermission(): Boolean
    suspend fun current(): LocationResult
}

/**
 * One-shot current location via the Fused Location Provider. No location updates are requested,
 * so the app never tracks the user in the background. Balanced priority accepts approximate fixes.
 */
class FusedLocationProvider(private val context: Context, private val timeoutMs: Long = 10_000) : LocationProvider {
    private val client = LocationServices.getFusedLocationProviderClient(context)

    override fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun fineGranted() = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    override suspend fun current(): LocationResult {
        if (!hasPermission()) return LocationResult.PermissionDenied
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        if (!lm.isProviderEnabled(LocationManager.GPS_PROVIDER) && !lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) return LocationResult.ServicesDisabled
        val cts = CancellationTokenSource()
        val request = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
            .setMaxUpdateAgeMillis(5 * 60_000)
            .setDurationMillis(timeoutMs)
            .build()
        val loc = withTimeoutOrNull(timeoutMs + 1_000) {
            runCatching { client.getCurrentLocation(request, cts.token).await() }.getOrNull()
        } ?: run {
            cts.cancel()
            return LocationResult.Timeout
        }
        return LocationResult.Success(LatLngDto(loc.latitude, loc.longitude), loc.accuracy, approximate = !fineGranted() || loc.accuracy > 1000)
    }
}
