package id.mam.app.ui.components

import android.content.Context
import android.graphics.Color as AndroidColor
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import id.mam.app.BuildConfig
import id.mam.app.data.model.LatLngDto
import id.mam.app.data.model.PlaceSummary
import org.osmdroid.config.Configuration
import org.osmdroid.events.DelayedMapListener
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.views.overlay.CopyrightOverlay
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon
import java.io.File

/** osmdroid needs a user agent (OSM tile usage policy) and a writable cache; keep tiles in the app cache dir. */
private fun configureOsmdroid(ctx: Context) {
    Configuration.getInstance().apply {
        userAgentValue = "${BuildConfig.APPLICATION_ID}/${BuildConfig.VERSION_NAME}"
        osmdroidBasePath = File(ctx.cacheDir, "osmdroid")
        osmdroidTileCache = File(ctx.cacheDir, "osmdroid/tiles")
    }
}

fun zoomForRadius(radius: Int): Double = when {
    radius <= 1000 -> 15.0
    radius <= 2000 -> 14.0
    radius <= 3000 -> 13.5
    radius <= 5000 -> 12.8
    else -> 11.8
}

/**
 * OpenStreetMap map with the search radius, a marker per place (tap = name, tap again = open detail)
 * and a "search this area" button after the user pans. Attribution "© OpenStreetMap contributors" is always shown.
 */
@Composable
fun OsmPlacesMap(
    center: LatLngDto,
    radius: Int,
    places: List<PlaceSummary>,
    onOpen: (String) -> Unit,
    onSearchArea: (LatLngDto) -> Unit,
    modifier: Modifier = Modifier,
) {
    val ctx = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val open by rememberUpdatedState(onOpen)
    var moved by remember { mutableStateOf<LatLngDto?>(null) }
    val map = remember {
        configureOsmdroid(ctx)
        MapView(ctx).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.SHOW_AND_FADEOUT)
            isTilesScaledToDpi = true
            minZoomLevel = 4.0
            maxZoomLevel = 19.0
            overlays.add(CopyrightOverlay(ctx))
        }
    }

    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_RESUME -> map.onResume()
                Lifecycle.Event.ON_PAUSE -> map.onPause()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            map.onDetach()
        }
    }

    Box(modifier.semantics { contentDescription = "Peta tempat makan di sekitar" }.testTag("osm-map")) {
        AndroidView(
            factory = {
                map.addMapListener(DelayedMapListener(object : MapListener {
                    override fun onScroll(event: ScrollEvent?): Boolean {
                        val c = map.mapCenter
                        moved = LatLngDto(c.latitude, c.longitude)
                        return false
                    }
                    override fun onZoom(event: ZoomEvent?): Boolean = false
                }, 300))
                map
            },
            update = { m ->
                val keep = m.overlays.filterIsInstance<CopyrightOverlay>()
                m.overlays.clear()
                m.overlays.add(Polygon(m).apply {
                    points = Polygon.pointsAsCircle(GeoPoint(center.lat, center.lng), radius.toDouble())
                    fillPaint.color = AndroidColor.argb(0x14, 0xFF, 0x9F, 0x43)
                    outlinePaint.color = AndroidColor.rgb(0xFF, 0x9F, 0x43)
                    outlinePaint.strokeWidth = 4f
                    setOnClickListener { _, _, _ -> false }
                })
                places.forEach { p ->
                    m.overlays.add(Marker(m).apply {
                        position = GeoPoint(p.location.lat, p.location.lng)
                        title = p.name
                        snippet = listOfNotNull(p.address ?: p.local?.city, "Ketuk lagi untuk detail").joinToString("\n")
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                        setOnMarkerClickListener { mk, _ ->
                            if (mk.isInfoWindowShown) open(p.placeId) else mk.showInfoWindow()
                            true
                        }
                    })
                }
                m.overlays.addAll(keep)
                val target = GeoPoint(center.lat, center.lng)
                if (m.tag != "$center/$radius") {
                    m.controller.setZoom(zoomForRadius(radius))
                    m.controller.setCenter(target)
                    m.tag = "$center/$radius"
                    moved = null
                }
                m.invalidate()
            },
            modifier = Modifier.fillMaxSize(),
        )
        val mv = moved
        if (mv != null && (Math.abs(mv.lat - center.lat) > 0.002 || Math.abs(mv.lng - center.lng) > 0.002)) {
            Button(onClick = { onSearchArea(mv); moved = null }, modifier = Modifier.align(Alignment.TopCenter).padding(top = 8.dp)) {
                Text("🔍 Cari di area ini")
            }
        }
    }
}

/** Location picker: tap the map to drop a pin, drag the pin to adjust. Shows "© OpenStreetMap contributors". */
@Composable
fun OsmPickerMap(center: LatLngDto, picked: LatLngDto?, onPick: (LatLngDto) -> Unit, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val pick by rememberUpdatedState(onPick)
    val map = remember {
        configureOsmdroid(ctx)
        MapView(ctx).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.SHOW_AND_FADEOUT)
            isTilesScaledToDpi = true
            controller.setZoom(16.0)
            overlays.add(CopyrightOverlay(ctx))
            overlays.add(MapEventsOverlay(object : MapEventsReceiver {
                override fun singleTapConfirmedHelper(p: GeoPoint): Boolean { pick(LatLngDto(p.latitude, p.longitude)); return true }
                override fun longPressHelper(p: GeoPoint): Boolean { pick(LatLngDto(p.latitude, p.longitude)); return true }
            }))
        }
    }
    val marker = remember { Marker(map).apply { isDraggable = true; setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM); title = "Lokasi tempat" } }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_RESUME -> map.onResume()
                Lifecycle.Event.ON_PAUSE -> map.onPause()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        marker.setOnMarkerDragListener(object : Marker.OnMarkerDragListener {
            override fun onMarkerDrag(m: Marker?) = Unit
            override fun onMarkerDragStart(m: Marker?) = Unit
            override fun onMarkerDragEnd(m: Marker?) { m?.position?.let { pick(LatLngDto(it.latitude, it.longitude)) } }
        })
        onDispose {
            lifecycle.removeObserver(observer)
            map.onDetach()
        }
    }
    AndroidView(
        factory = { map },
        update = { m ->
            if (m.tag != center) {
                m.controller.setCenter(GeoPoint(center.lat, center.lng))
                m.tag = center
            }
            if (picked != null) {
                marker.position = GeoPoint(picked.lat, picked.lng)
                if (marker !in m.overlays) m.overlays.add(marker)
            } else {
                m.overlays.remove(marker)
            }
            m.invalidate()
        },
        modifier = modifier.semantics { contentDescription = "Peta untuk memilih lokasi tempat" }.testTag("picker-map"),
    )
}
