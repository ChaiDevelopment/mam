package id.mam.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import id.mam.app.BuildConfig
import id.mam.app.MamApplication
import id.mam.app.data.remote.ServerConfig
import id.mam.app.ui.theme.LocalMamColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/** Pings `<server>/health`. Returns null on success or an Indonesian error message. */
private suspend fun pingServer(baseUrl: String): String? = withContext(Dispatchers.IO) {
    runCatching {
        val client = OkHttpClient.Builder().connectTimeout(5, TimeUnit.SECONDS).readTimeout(5, TimeUnit.SECONDS).build()
        client.newCall(Request.Builder().url("${baseUrl}health").build()).execute().use { r ->
            if (r.isSuccessful) null else "Server menjawab HTTP ${r.code}."
        }
    }.getOrElse { e -> "Tidak dapat terhubung: ${e.message ?: e.javaClass.simpleName}. Pastikan HP dan laptop di Wi-Fi yang sama dan API berjalan." }
}

/**
 * DEBUG BUILDS ONLY: choose which MAM! API server the app uses (e.g. the PC's Wi-Fi IP on a real phone).
 * Hidden in release builds.
 */
@Composable
fun ServerSettingsCard(modifier: Modifier = Modifier) {
    if (!BuildConfig.DEBUG) return
    val server = (LocalContext.current.applicationContext as MamApplication).container.server
    val scope = rememberCoroutineScope()
    var input by remember { mutableStateOf(server.baseUrl) }
    var status by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    Card(modifier.fillMaxWidth().testTag("server-settings")) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Alamat server (mode pengembangan)", style = MaterialTheme.typography.titleSmall)
            Text(
                "Di emulator: 10.0.2.2. Di HP: isi IP Wi-Fi laptop yang menjalankan API, mis. 192.168.1.5 (cek dengan perintah ipconfig).",
                style = MaterialTheme.typography.labelMedium, color = LocalMamColors.current.textMuted,
            )
            OutlinedTextField(
                input, { input = it }, singleLine = true, label = { Text("IP atau URL server") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth().testTag("server-url"),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(enabled = !busy, onClick = {
                    val url = ServerConfig.normalize(input)
                    if (url == null) { status = "Alamat tidak valid."; return@Button }
                    busy = true
                    scope.launch {
                        val err = pingServer(url)
                        if (err == null) {
                            server.set(url)
                            input = url
                            status = "✓ Terhubung. Server disimpan: $url"
                        } else status = err
                        busy = false
                    }
                }) { Text(if (busy) "Menguji…" else "Tes & simpan") }
                if (server.isOverridden) OutlinedButton(onClick = { server.reset(); input = server.baseUrl; status = "Kembali ke bawaan: ${server.baseUrl}" }) { Text("Bawaan") }
            }
            status?.let { Text(it, style = MaterialTheme.typography.labelMedium) }
            TextButton(onClick = { busy = true; scope.launch { status = pingServer(server.baseUrl) ?: "✓ Server aktif terhubung: ${server.baseUrl}"; busy = false } }) {
                Text("Cek server aktif")
            }
        }
    }
}
