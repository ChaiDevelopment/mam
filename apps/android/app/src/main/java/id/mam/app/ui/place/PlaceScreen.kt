package id.mam.app.ui.place

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import id.mam.app.BuildConfig
import id.mam.app.data.model.OSM_ATTRIBUTION
import id.mam.app.data.model.PlaceSummary
import id.mam.app.data.model.Review
import id.mam.app.data.model.isGoogle
import id.mam.app.data.model.displayUrl
import id.mam.app.data.model.isOwnerPermission
import id.mam.app.ui.Format
import id.mam.app.ui.components.*
import id.mam.app.ui.theme.LocalMamColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceScreen(vm: PlaceViewModel, photoUrl: (String) -> String, onBack: () -> Unit, onWriteReview: (String) -> Unit) {
    val s by vm.state.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(s.message) { s.message?.let { snackbar.showSnackbar(it); vm.messageShown() } }
    val open = { url: String -> ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }

    Scaffold(
        topBar = { TopAppBar(title = { Text(s.place?.name ?: "") }, navigationIcon = { TextButton(onClick = onBack) { Text("←") } }) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { pad ->
        when {
            s.loading -> Column(Modifier.padding(pad).padding(16.dp)) { repeat(4) { SkeletonCard() } }
            s.error != null -> Box(Modifier.padding(pad)) { ErrorState(s.error!!, vm::load) }
            s.place != null -> {
                val p = s.place!!
                LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    s.providerNotice?.let { item { Notice(it) } }
                    if (p.photos.isNotEmpty()) item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(p.photos.take(6)) { ph ->
                                Column {
                                    AsyncImage(photoUrl(ph.name), "Foto ${p.name}", contentScale = ContentScale.Crop, modifier = Modifier.size(220.dp, 150.dp).clip(MaterialTheme.shapes.medium))
                                    ph.authorAttributions.firstOrNull()?.let { a ->
                                        Text("Foto: ${a.displayName}", style = MaterialTheme.typography.labelMedium, color = LocalMamColors.current.textMuted, modifier = Modifier.then(if (a.uri != null) Modifier.clickableUrl { open(a.uri) } else Modifier))
                                    }
                                }
                            }
                        }
                    }
                    item {
                        Text(p.name, style = MaterialTheme.typography.headlineMedium)
                        Text(listOfNotNull(p.categories.joinToString { Format.CATEGORY_LABELS[it] ?: it }.ifBlank { null }, p.address ?: p.local?.city).joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = LocalMamColors.current.textMuted)
                        PriceLine(p)
                    }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { onWriteReview(p.placeId) }) { Text("✍️ Tulis ulasan") }
                            OutlinedButton(onClick = vm::toggleFavorite) { Text(if (s.favorite) "❤️ Favorit" else "🤍 Simpan") }
                            OutlinedButton(onClick = {
                                ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "Cek ${p.name} di MAM! ${BuildConfig.WEB_BASE_URL}/tempat/${p.placeId}"), "Bagikan"))
                            }) { Text("Bagikan") }
                        }
                    }
                    // MAM! community data
                    item {
                        Card {
                            Column(Modifier.padding(16.dp).fillMaxWidth()) {
                                Row(verticalAlignment = Alignment.CenterVertically) { Text("Rating komunitas", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f)); SourceTag("mam") }
                                val st = s.stats
                                if (st != null && st.reviewCount > 0) {
                                    Text(Format.rating(st.averageOverall), style = MaterialTheme.typography.displaySmall)
                                    Text("dari ${st.reviewCount} ulasan MAM!", style = MaterialTheme.typography.bodyMedium)
                                    st.medianPricePaid?.let { Text("Median harga dilaporkan: ${Format.idr(it)}", style = MaterialTheme.typography.bodyMedium) }
                                } else Text("Belum ada ulasan MAM!. Jadilah yang pertama!", style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                    // Google data (only for Google places) — OSM/community places show their data source instead
                    if (!p.isGoogle) item { DataSourceCard(p, open) }
                    if (p.isGoogle) item {
                        Card {
                            Column(Modifier.padding(16.dp).fillMaxWidth()) {
                                Row(verticalAlignment = Alignment.CenterVertically) { Text("Rating Google Maps", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f)); SourceTag("google") }
                                if (p.google.rating != null) {
                                    Text(Format.rating(p.google.rating), style = MaterialTheme.typography.displaySmall)
                                    Text("dari ${p.google.userRatingCount ?: 0} ulasan Google", style = MaterialTheme.typography.bodyMedium)
                                } else Text("Tidak tersedia saat ini.", style = MaterialTheme.typography.bodyMedium)
                                Text("Rating Google dan MAM! dihitung terpisah.", style = MaterialTheme.typography.labelMedium, color = LocalMamColors.current.textMuted)
                                TextButton(onClick = { open(p.google.mapsUri ?: "https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${p.placeId}") }) { Text("Buka di Google Maps ↗") }
                            }
                        }
                    }
                    item { Text("Ulasan komunitas", style = MaterialTheme.typography.titleLarge) }
                    if (s.reviews.isEmpty()) item { EmptyState("Belum ada ulasan MAM!", "Bagikan pengalamanmu makan di sini.") }
                    items(s.reviews, key = { it.id }) { r -> ReviewItem(r, onHelpful = { vm.react(r.id) }, onReport = { vm.report(r.id, "SPAM") }) }

                    if (p.isGoogle) s.google?.let { g ->
                        item {
                            Column(Modifier.fillMaxWidth().clip(MaterialTheme.shapes.large).background(LocalMamColors.current.googleSoft).padding(16.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) { Text("Cuplikan ulasan Google", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f)); SourceTag("google") }
                                Text("Google menyediakan maksimal 5 ulasan; ini bukan seluruh ulasan.", style = MaterialTheme.typography.labelMedium)
                                if (!g.provider.ok) Text(g.provider.message ?: "Tidak tersedia.", style = MaterialTheme.typography.bodyMedium)
                                g.reviews.forEach { gr ->
                                    Spacer(Modifier.height(8.dp))
                                    Text("${gr.author.displayName} · ${gr.relativePublishTime ?: ""} · ★${gr.rating?.let(Format::rating) ?: "-"}", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium,
                                        modifier = if (gr.author.uri != null) Modifier.clickableUrl { open(gr.author.uri) } else Modifier)
                                    gr.text?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                                }
                                g.googleMapsUri?.let { TextButton(onClick = { open(it) }) { Text("Semua ulasan di Google Maps ↗") } }
                                g.writeReviewUri?.let { TextButton(onClick = { open(it) }) { Text("Tulis ulasan di Google Maps ↗") } }
                                Text("Google Maps", style = MaterialTheme.typography.labelMedium, color = LocalMamColors.current.google)
                            }
                        }
                    }
                    item {
                        Card {
                            Column(Modifier.padding(16.dp).fillMaxWidth()) {
                                Row(verticalAlignment = Alignment.CenterVertically) { Text("Pesan-antar", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f)); SourceTag("delivery") }
                                Text("MAM! tidak menerima pesanan. Menu & harga hanya ada di aplikasi penyedia.", style = MaterialTheme.typography.labelMedium, color = LocalMamColors.current.textMuted)
                                if (s.links.isEmpty()) Text("Belum ada data platform untuk tempat ini.", style = MaterialTheme.typography.bodyMedium)
                                s.links.forEach { l ->
                                    Spacer(Modifier.height(8.dp))
                                    Text("${l.providerName} — ${availabilityLabel(l.availability)}", fontWeight = FontWeight.SemiBold)
                                    Text(l.note, style = MaterialTheme.typography.bodyMedium, color = LocalMamColors.current.textMuted)
                                    l.url?.let { TextButton(onClick = { open(it) }) { Text("Buka di ${l.providerName} ↗") } }
                                }
                            }
                        }
                    }
                    p.openingHours?.let { h -> item { Text("Jam buka (Google)\n" + h.joinToString("\n"), style = MaterialTheme.typography.bodyMedium) } }
                }
            }
        }
    }
}

private fun availabilityLabel(a: String) = when (a) {
    "VERIFIED" -> "Terverifikasi"
    "UNVERIFIED" -> "Belum diverifikasi"
    "UNAVAILABLE" -> "Tidak tersedia"
    else -> "Data tidak tersedia"
}

private fun Modifier.clickableUrl(onClick: () -> Unit): Modifier = this.clickable(onClick = onClick)

@Composable
fun ReviewItem(r: Review, onHelpful: () -> Unit, onReport: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(r.author.displayName, fontWeight = FontWeight.Bold)
                    Text(r.createdAt.take(10) + if (r.edited) " · diedit" else "", style = MaterialTheme.typography.labelMedium, color = LocalMamColors.current.textMuted)
                }
                Text(Format.rating(r.ratings.overall), style = MaterialTheme.typography.titleLarge)
            }
            Text("Rasa ${r.ratings.taste} · Harga ${r.ratings.price} · Porsi ${r.ratings.portion} · Bersih ${r.ratings.cleanliness} · Layanan ${r.ratings.service}", style = MaterialTheme.typography.labelMedium)
            Spacer(Modifier.height(6.dp))
            Text(r.text, style = MaterialTheme.typography.bodyLarge)
            r.pricePaid?.let { Text("💸 ${Format.idr(it)} (dilaporkan pengulas)", style = MaterialTheme.typography.bodyMedium) }
            if (r.photos.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 6.dp)) {
                items(r.photos) { ph -> AsyncImage(ph.thumbUrl.let { if (it.startsWith("/")) id.mam.app.data.remote.ServerConfig.origin + it else it }, "Foto makanan", contentScale = ContentScale.Crop, modifier = Modifier.size(80.dp).clip(MaterialTheme.shapes.small)) }
            }
            Row {
                TextButton(onClick = onHelpful) { Text("👍 ${r.reactions["HELPFUL"] ?: 0}") }
                TextButton(onClick = onReport) { Text("Laporkan") }
            }
        }
    }
}

/** Data-source card for OpenStreetMap and community places (no Google rating exists for them). */
@Composable
private fun DataSourceCard(p: PlaceSummary, open: (String) -> Unit) {
    val osm = p.source == "OSM"
    Card {
        Column(Modifier.padding(16.dp).fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Sumber data tempat", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                SourceTag(if (osm) "osm" else "community-place")
            }
            Text(
                if (osm) "Nama, lokasi, dan info tempat ini berasal dari OpenStreetMap, peta terbuka buatan para kontributor."
                else "Tempat ini ditambahkan oleh pengguna MAM! karena belum ada di peta.",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (p.local?.cuisine?.isNotEmpty() == true) Text("Masakan: ${p.local.cuisine.joinToString()}", style = MaterialTheme.typography.labelMedium, color = LocalMamColors.current.textMuted)
            p.local?.brand?.let { b ->
                Spacer(Modifier.height(8.dp))
                Text("Bagian dari jaringan ${b.name}", style = MaterialTheme.typography.titleSmall)
                b.description?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = LocalMamColors.current.textMuted) }
                (b.logo ?: b.image)?.let { c ->
                    AsyncImage(model = c.displayUrl, contentDescription = "Logo ${b.name}", contentScale = ContentScale.Fit, modifier = Modifier.height(64.dp).padding(vertical = 4.dp))
                    Text(
                        "${if (b.logo != null) "Logo" else "Foto"}: ${c.author} · " +
                            if (c.isOwnerPermission) "digunakan dengan izin pemilik merek" else "${c.license} · Wikimedia Commons",
                        style = MaterialTheme.typography.labelSmall, color = LocalMamColors.current.textMuted,
                        modifier = Modifier.clickableUrl { c.sourceUrl?.let(open) },
                    )
                }
                b.website?.let { w -> TextButton(onClick = { open(w) }) { Text("Situs resmi ↗") } }
            }
            p.local?.osmUrl?.let { TextButton(onClick = { open(it) }) { Text("Lihat / perbaiki di OpenStreetMap ↗") } }
            TextButton(onClick = { open("https://www.google.com/maps/dir/?api=1&destination=${p.location.lat},${p.location.lng}") }) { Text("🧭 Petunjuk arah ↗") }
            if (osm) Text(OSM_ATTRIBUTION, style = MaterialTheme.typography.labelMedium, color = LocalMamColors.current.textMuted, modifier = Modifier.clickableUrl { open("https://www.openstreetmap.org/copyright") })
        }
    }
}
