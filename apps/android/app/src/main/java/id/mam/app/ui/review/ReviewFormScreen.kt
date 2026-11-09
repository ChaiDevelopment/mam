package id.mam.app.ui.review

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import id.mam.app.BuildConfig
import id.mam.app.ui.Format
import id.mam.app.ui.components.Notice
import id.mam.app.ui.components.StarRatingInput

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReviewFormScreen(vm: ReviewFormViewModel, onDone: () -> Unit, onBack: () -> Unit) {
    val s by vm.state.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    var confirmDelete by remember { mutableStateOf(false) }
    LaunchedEffect(s.done) { if (s.done) onDone() }
    // System photo picker: no storage permission needed; only the chosen images are shared with the app.
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(MAX_PHOTOS)) { uris ->
        uris.forEach { uri ->
            val mime = ctx.contentResolver.getType(uri) ?: "application/octet-stream"
            val bytes = runCatching { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
            if (bytes != null) vm.addPhoto(bytes, mime, "foto.${mime.substringAfter('/')}")
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text(if (s.existingId != null) "Edit ulasan" else "Tulis ulasan") }, navigationIcon = { TextButton(onClick = onBack) { Text("←") } }) }) { pad ->
        if (s.loading) {
            Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Scaffold
        }
        Column(Modifier.padding(pad).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(s.placeName, style = MaterialTheme.typography.titleLarge)
            Text("Ulasan ini dipublikasikan di MAM!, bukan di Google Maps. Satu ulasan per tempat — bisa diedit kapan saja.", style = MaterialTheme.typography.bodyMedium)
            val f = s.form
            StarRatingInput("Rasa", f.taste, { v -> vm.update { it.copy(taste = v) } })
            StarRatingInput("Harga", f.price, { v -> vm.update { it.copy(price = v) } })
            StarRatingInput("Porsi", f.portion, { v -> vm.update { it.copy(portion = v) } })
            StarRatingInput("Kebersihan", f.cleanliness, { v -> vm.update { it.copy(cleanliness = v) } })
            StarRatingInput("Layanan", f.service, { v -> vm.update { it.copy(service = v) } })
            Text("Pengalaman keseluruhan: ${f.overall?.let(Format::rating) ?: "—"} (otomatis dari 5 aspek)", style = MaterialTheme.typography.labelLarge)
            OutlinedTextField(
                value = f.text, onValueChange = { t -> vm.update { it.copy(text = t.take(3000)) } },
                label = { Text("Ceritakan pengalamanmu (min. $MIN_TEXT karakter)") },
                minLines = 4, modifier = Modifier.fillMaxWidth().testTag("review-text"),
                supportingText = { Text("${f.text.length}/3000") },
            )
            OutlinedTextField(
                value = f.pricePaid, onValueChange = { t -> vm.update { it.copy(pricePaid = t.filter(Char::isDigit).take(8)) } },
                label = { Text("Harga yang kamu bayar (Rp, opsional)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth(),
            )
            Text("Cara makan", style = MaterialTheme.typography.labelLarge)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                listOf("DINE_IN" to "Di tempat", "TAKEAWAY" to "Bawa pulang", "DELIVERY" to "Pesan-antar").forEachIndexed { i, (k, l) ->
                    SegmentedButton(selected = f.visitType == k, onClick = { vm.update { it.copy(visitType = k) } }, shape = SegmentedButtonDefaults.itemShape(i, 3)) { Text(l) }
                }
            }
            Text("Foto makanan (maks $MAX_PHOTOS, GPS dihapus otomatis)", style = MaterialTheme.typography.labelLarge)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(s.photos, key = { it.id }) { p ->
                    Box {
                        AsyncImage(p.thumbUrl.let { if (it.startsWith("/")) id.mam.app.data.remote.ServerConfig.origin + it else it }, "Foto yang diunggah", contentScale = ContentScale.Crop, modifier = Modifier.size(88.dp).clip(MaterialTheme.shapes.small))
                        TextButton(onClick = { vm.removePhoto(p.id) }, modifier = Modifier.align(Alignment.TopEnd)) { Text("✕") }
                    }
                }
                if (s.uploading > 0) item { Box(Modifier.size(88.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            }
            OutlinedButton(enabled = s.photos.size + s.uploading < MAX_PHOTOS, onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) { Text("📷 Tambah foto") }
            s.error?.let { Notice(it) }
            Button(onClick = vm::submit, enabled = !s.saving && s.uploading == 0, modifier = Modifier.fillMaxWidth().testTag("submit-review")) {
                Text(if (s.saving) "Menyimpan…" else if (s.existingId != null) "Simpan perubahan" else "Terbitkan ulasan")
            }
            if (s.existingId != null) TextButton(onClick = { confirmDelete = true }) { Text("Hapus ulasan", color = MaterialTheme.colorScheme.error) }
        }
    }
    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Hapus ulasan?") },
        text = { Text("Ulasan dan fotonya akan dihapus dari MAM!.") },
        confirmButton = { TextButton(onClick = { confirmDelete = false; vm.delete() }) { Text("Hapus") } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Batal") } },
    )
}
