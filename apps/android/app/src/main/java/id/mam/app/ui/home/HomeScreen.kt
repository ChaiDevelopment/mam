package id.mam.app.ui.home

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.mam.app.data.model.LatLngDto
import id.mam.app.data.model.PlaceSummary
import id.mam.app.data.model.RADIUS_OPTIONS_METERS
import id.mam.app.ui.Format
import id.mam.app.ui.components.*
import id.mam.app.ui.theme.LocalMamColors

@Composable
fun HomeScreen(vm: HomeViewModel, photoUrl: (String) -> String, onOpenPlace: (String) -> Unit, onSurprise: () -> Unit) {
    val s by vm.state.collectAsStateWithLifecycle()
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        vm.onPermissionResult(granted.values.any { it })
    }
    val askLocation = { permission.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION)) }

    LazyColumn(Modifier.fillMaxSize().testTag("home"), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text("Discover. Review. Eat.", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Text("Mau makan apa hari ini?", style = MaterialTheme.typography.headlineMedium)
            }
        }
        item { LocationSection(s, askLocation, vm) }
        if (s.location is LocationState.Ready) {
            item {
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.testTag("radius")) {
                    items(RADIUS_OPTIONS_METERS) { r ->
                        FilterChip(selected = s.radius == r, onClick = { vm.setRadius(r) }, label = { Text(Format.radiusLabel(r)) }, shape = RoundedCornerShape(999.dp))
                    }
                }
            }
            item { FilterChipRow(Format.CATEGORY_LABELS.toList(), s.categories, vm::toggleCategory) }
            item {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    val ok = s.results as? ResultsState.Success
                    Text(
                        if (ok == null) "" else "${"%,d".format(ok.total).replace(',', '.')} tempat dalam ${Format.radiusLabel(s.radius)}" +
                            if (ok.total > ok.items.size) " · ${ok.items.size} terdekat" else "", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    SingleChoiceSegmentedButtonRow {
                        SegmentedButton(selected = s.viewMode == ViewMode.LIST, onClick = { vm.setViewMode(ViewMode.LIST) }, shape = SegmentedButtonDefaults.itemShape(0, 2)) { Text("Daftar") }
                        SegmentedButton(selected = s.viewMode == ViewMode.MAP, onClick = { vm.setViewMode(ViewMode.MAP) }, shape = SegmentedButtonDefaults.itemShape(1, 2)) { Text("Peta") }
                    }
                }
            }
            when (val r = s.results) {
                ResultsState.Idle, ResultsState.Loading -> items(5) { Box(Modifier.padding(horizontal = 16.dp)) { SkeletonCard() } }
                is ResultsState.Error -> item { ErrorState(r.message, vm::load) }
                is ResultsState.Success -> {
                    if (r.notice != null) item { Notice(r.notice, Modifier.padding(horizontal = 16.dp)) }
                    if (s.viewMode == ViewMode.MAP) {
                        item { PlacesMap((s.location as LocationState.Ready).center, s.radius, r.items, onOpenPlace) { vm.setManualCenter(it, "Area pilihan di peta") } }
                    } else if (r.items.isEmpty()) {
                        item { EmptyState("Belum ada tempat yang cocok", "Coba perbesar radius atau longgarkan filter.") }
                    } else {
                        items(r.items, key = { it.placeId }) { p -> Box(Modifier.padding(horizontal = 16.dp)) { PlaceCard(p, photoUrl) { onOpenPlace(p.placeId) } } }
                        item { Text("Google Maps", style = MaterialTheme.typography.labelMedium, color = LocalMamColors.current.google, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), textAlign = TextAlign.End) }
                    }
                }
            }
            item {
                Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clickable(onClick = onSurprise), colors = CardDefaults.cardColors(containerColor = LocalMamColors.current.secondarySoft)) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("🎲", style = MaterialTheme.typography.headlineMedium)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text("Bingung? Biar MAM! yang pilih!", style = MaterialTheme.typography.titleMedium)
                            Text("Rekomendasi acak yang tetap relevan.", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LocationSection(s: HomeUiState, askLocation: () -> Unit, vm: HomeViewModel) {
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        when (val l = s.location) {
            is LocationState.Ready -> Text("📍 ${l.label}", style = MaterialTheme.typography.labelLarge)
            LocationState.Requesting -> Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
                Text("Mencari lokasimu…")
            }
            else -> {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("📍", style = MaterialTheme.typography.displaySmall)
                        Text("Lapar? Yuk cari yang dekat!", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Lokasi dipakai sekali untuk mencari tempat dalam radius pilihanmu. Tidak ada pelacakan di latar belakang.",
                            style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, color = LocalMamColors.current.textMuted,
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = askLocation, modifier = Modifier.testTag("use-location")) { Text("Gunakan lokasiku") }
                    }
                }
                if (l is LocationState.Problem) Notice(l.message)
            }
        }
        OutlinedTextField(
            value = s.manualQuery,
            onValueChange = vm::onManualQuery,
            label = { Text("Cari area secara manual") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("manual-location"),
            shape = RoundedCornerShape(999.dp),
        )
        s.manualResults.forEach { p ->
            Text(
                "${p.name}${p.address?.let { " · $it" } ?: ""}",
                modifier = Modifier.fillMaxWidth().clickable { vm.setManualCenter(p.location, p.name) }.padding(vertical = 8.dp),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun PlacesMap(center: LatLngDto, radius: Int, places: List<PlaceSummary>, onOpen: (String) -> Unit, onSearchArea: (LatLngDto) -> Unit) {
    OsmPlacesMap(center, radius, places, onOpen, onSearchArea, Modifier.fillMaxWidth().height(420.dp).padding(horizontal = 16.dp))
}
