package id.mam.app.ui.place

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.mam.app.data.model.PlaceSubmission
import id.mam.app.ui.Format
import id.mam.app.ui.components.FilterChipRow
import id.mam.app.ui.components.OsmPickerMap
import id.mam.app.ui.theme.LocalMamColors

/** Add a food place missing from the map. Regular users' places wait for a moderator (rejections are e-mailed). */
@Composable
fun AddPlaceScreen(vm: AddPlaceViewModel, onOpenPlace: (String) -> Unit, onBack: () -> Unit) {
    val s by vm.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(s.message) { s.message?.let { snackbar.showSnackbar(it); vm.messageShown() } }
    val x = LocalMamColors.current

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { pad ->
        Column(
            Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 16.dp).testTag("add-place"),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) { Text("← Kembali") }
            }
            Text("Tambah tempat makan", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(horizontal = 16.dp))
            Text(
                "Tempat favoritmu belum ada di MAM!? Tambahkan di sini. Tempat akan tampil setelah disetujui moderator.",
                style = MaterialTheme.typography.bodyMedium, color = x.textMuted, modifier = Modifier.padding(horizontal = 16.dp),
            )

            val submitted = s.submitted
            if (submitted != null) {
                Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp).testTag("submitted")) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(if (submitted.status == "ACTIVE") "✅ \"${submitted.name}\" sudah tampil" else "✅ Pengajuan \"${submitted.name}\" terkirim", style = MaterialTheme.typography.titleMedium)
                        Text(
                            if (submitted.status == "ACTIVE") "Akun staf: tempat langsung terbit."
                            else "Tempat akan tampil setelah disetujui moderator. Kalau ditolak, alasannya dikirim ke email kamu.",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (submitted.status == "ACTIVE") OutlinedButton(onClick = { onOpenPlace(submitted.placeId) }) { Text("Lihat tempat") }
                            Button(onClick = vm::startAnother) { Text("Ajukan tempat lain") }
                        }
                    }
                }
            } else {
                OutlinedTextField(s.name, vm::setName, label = { Text("Nama tempat *") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).testTag("place-name"))
                Text("Lokasi di peta * — ketuk peta, lalu geser pin ke titik yang tepat.", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(horizontal = 16.dp))
                OsmPickerMap(center = s.mapCenter, picked = s.picked, onPick = vm::pick, modifier = Modifier.fillMaxWidth().height(260.dp).padding(horizontal = 16.dp).clip(RoundedCornerShape(12.dp)))
                Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        s.picked?.let { "📍 %.5f, %.5f".format(it.lat, it.lng) } ?: "Belum ada titik dipilih.",
                        style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f).testTag("picked"),
                    )
                    TextButton(onClick = vm::useMyLocation) { Text("Pakai lokasiku") }
                }
                Text("Kategori * (maks. 3)", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(horizontal = 16.dp))
                FilterChipRow(Format.CATEGORY_LABELS.toList(), s.categories, vm::toggleCategory)
                OutlinedTextField(s.address, vm::setAddress, label = { Text("Alamat (opsional)") }, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp))
                Button(onClick = vm::submit, enabled = !s.loading, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).testTag("submit-place")) {
                    Text(if (s.loading) "Mengirim…" else "Simpan tempat")
                }
            }

            if (s.mine.isNotEmpty()) {
                Text("Pengajuan tempatku", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
                s.mine.forEach { SubmissionRow(it, onOpenPlace) }
            }
        }
    }
}

@Composable
private fun SubmissionRow(s: PlaceSubmission, onOpenPlace: (String) -> Unit) {
    val x = LocalMamColors.current
    val (label, bg) = when (s.status) {
        "ACTIVE" -> "Disetujui" to x.primarySoft
        "REJECTED" -> "Ditolak" to MaterialTheme.colorScheme.errorContainer
        else -> "Menunggu moderator" to x.secondarySoft
    }
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(s.name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                Text(label, style = MaterialTheme.typography.labelMedium, modifier = Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 8.dp, vertical = 2.dp))
            }
            Text(listOfNotNull(s.address, s.city).joinToString(" · ").ifBlank { "%.5f, %.5f".format(s.location.lat, s.location.lng) }, style = MaterialTheme.typography.bodySmall, color = x.textMuted)
            if (s.status == "REJECTED" && s.moderationNote != null) Text("Alasan: ${s.moderationNote}", style = MaterialTheme.typography.bodyMedium)
            if (s.status == "ACTIVE") TextButton(onClick = { onOpenPlace(s.placeId) }, contentPadding = PaddingValues(0.dp)) { Text("Lihat tempat →") }
        }
    }
}
