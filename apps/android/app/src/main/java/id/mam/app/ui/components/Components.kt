package id.mam.app.ui.components

import id.mam.app.data.model.displayUrl

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import id.mam.app.data.model.PlaceSummary
import id.mam.app.ui.Format
import id.mam.app.ui.theme.LocalMamColors

@Composable
fun SourceTag(source: String, modifier: Modifier = Modifier) {
    val x = LocalMamColors.current
    val (text, bg, fg) = when (source) {
        "google" -> Triple("Google", x.googleSoft, x.google)
        "delivery" -> Triple("Platform pesan-antar", x.secondarySoft, MaterialTheme.colorScheme.onSurface)
        "osm" -> Triple("OpenStreetMap", x.surfaceMuted, MaterialTheme.colorScheme.onSurface)
        "community-place" -> Triple("Ditambah komunitas", x.secondarySoft, MaterialTheme.colorScheme.onSurface)
        else -> Triple("MAM!", x.primarySoft, MaterialTheme.colorScheme.onSurface)
    }
    Text(text, modifier = modifier.clip(RoundedCornerShape(6.dp)).background(bg).padding(horizontal = 6.dp, vertical = 1.dp), color = fg, style = MaterialTheme.typography.labelMedium)
}

@Composable
fun FilterChipRow(options: List<Pair<String, String>>, selected: Set<String>, onToggle: (String) -> Unit, modifier: Modifier = Modifier) {
    androidx.compose.foundation.lazy.LazyRow(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(horizontal = 16.dp)) {
        items(options.size) { i ->
            val (key, label) = options[i]
            FilterChip(selected = key in selected, onClick = { onToggle(key) }, label = { Text(label) }, shape = RoundedCornerShape(999.dp))
        }
    }
}

@Composable
fun PlaceCard(place: PlaceSummary, photoUrl: (String) -> String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val x = LocalMamColors.current
    Card(
        modifier = modifier.fillMaxWidth().clickable(onClickLabel = "Buka detail ${place.name}", onClick = onClick),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(84.dp).clip(MaterialTheme.shapes.medium).background(x.primarySoft), contentAlignment = Alignment.Center) {
                val brand = place.local?.brand
                when {
                    place.photo != null ->
                        AsyncImage(model = photoUrl(place.photo.name), contentDescription = "Foto ${place.name}", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                    brand?.logo != null ->
                        AsyncImage(model = brand.logo.displayUrl, contentDescription = "Logo ${brand.name}", contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color.White).padding(8.dp))
                    brand?.image != null ->
                        AsyncImage(model = brand.image.displayUrl, contentDescription = "Foto ${brand.name}", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                    else -> Text("🍜", style = MaterialTheme.typography.headlineMedium)
                }
            }
            Column(Modifier.weight(1f)) {
                Text(place.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val meta = listOfNotNull(Format.distance(place.distanceMeters).ifBlank { null }, place.categories.firstOrNull()?.let { Format.CATEGORY_LABELS[it] }, place.address ?: place.local?.city).joinToString(" · ")
                Text(meta, style = MaterialTheme.typography.bodyMedium, color = x.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics(mergeDescendants = true) {}) {
                        SourceTag("mam")
                        Spacer(Modifier.width(4.dp))
                        val c = place.community
                        Text(if (c?.averageOverall != null) "${Format.rating(c.averageOverall)} (${c.reviewCount})" else "belum ada ulasan", style = MaterialTheme.typography.bodyMedium)
                    }
                    if (place.source == "OSM") SourceTag("osm")
                    if (place.source == "COMMUNITY") SourceTag("community-place")
                    if (place.google.rating != null) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics(mergeDescendants = true) {}) {
                            SourceTag("google")
                            Spacer(Modifier.width(4.dp))
                            Text("${Format.rating(place.google.rating)} (${place.google.userRatingCount ?: 0})", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
                PriceLine(place)
                if (place.openNow != null) {
                    Text(if (place.openNow) "Buka sekarang" else "Tutup", style = MaterialTheme.typography.labelMedium, color = if (place.openNow) x.success else x.textMuted)
                }
            }
        }
    }
}

/** Price with explicit source. Google price *levels* are never converted into Rupiah. */
@Composable
fun PriceLine(place: PlaceSummary) {
    val x = LocalMamColors.current
    val median = place.community?.medianPricePaid
    val range = place.google.priceRange
    val text = when {
        median != null -> "~${Format.idr(median)} (laporan MAM!)"
        range != null && (range.min != null || range.max != null) && range.currency == "IDR" ->
            listOfNotNull(range.min?.let(Format::idr), range.max?.let(Format::idr)).joinToString("–") + " (Google)"
        else -> null
    }
    if (text != null) Text(text, style = MaterialTheme.typography.bodyMedium, color = x.textMuted)
}

@Composable
fun StarRatingInput(label: String, value: Int, onChange: (Int) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
        (1..5).forEach { i ->
            Text(
                "★",
                style = MaterialTheme.typography.headlineMedium,
                color = if (i <= value) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.outline,
                modifier = Modifier
                    .sizeIn(minWidth = 44.dp, minHeight = 44.dp)
                    .wrapContentSize()
                    .clickable { onChange(i) }
                    .semantics {
                        contentDescription = "$label $i dari 5"
                        role = Role.RadioButton
                        selected = value == i
                    },
            )
        }
    }
}

@Composable
fun EmptyState(title: String, body: String? = null, emoji: String = "🍽️", action: (@Composable () -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(emoji, style = MaterialTheme.typography.displaySmall)
        Spacer(Modifier.height(8.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (body != null) Text(body, style = MaterialTheme.typography.bodyMedium, color = LocalMamColors.current.textMuted, textAlign = TextAlign.Center)
        if (action != null) {
            Spacer(Modifier.height(12.dp))
            action()
        }
    }
}

@Composable
fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Ups, ada yang tidak beres.", style = MaterialTheme.typography.titleMedium)
        Text(message, style = MaterialTheme.typography.bodyMedium, color = LocalMamColors.current.textMuted, textAlign = TextAlign.Center)
        Spacer(Modifier.height(12.dp))
        OutlinedButton(onClick = onRetry) { Text("Coba lagi") }
    }
}

@Composable
fun Notice(text: String, modifier: Modifier = Modifier) {
    Text(
        "ℹ️ $text",
        modifier = modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).background(LocalMamColors.current.secondarySoft).padding(12.dp),
        style = MaterialTheme.typography.bodyMedium,
    )
}

@Composable
fun SkeletonCard() {
    val alpha by rememberInfiniteTransition(label = "sk").animateFloat(0.4f, 0.9f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "a")
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp).alpha(alpha).semantics { contentDescription = "Memuat" }, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(84.dp).clip(MaterialTheme.shapes.medium).background(LocalMamColors.current.surfaceMuted))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.fillMaxWidth(0.7f).height(16.dp).clip(CircleShape).background(LocalMamColors.current.surfaceMuted))
            Box(Modifier.fillMaxWidth(0.5f).height(12.dp).clip(CircleShape).background(LocalMamColors.current.surfaceMuted))
            Box(Modifier.fillMaxWidth(0.3f).height(12.dp).clip(CircleShape).background(LocalMamColors.current.surfaceMuted))
        }
    }
}
