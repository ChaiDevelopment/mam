package id.mam.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Plus Jakarta Sans is the brand font. It is resolved via downloadable fonts when added under
// res/font; until then the system sans-serif keeps identical metrics/weights for the hierarchy below.
private val Jakarta = FontFamily.SansSerif

val MamTypography = Typography(
    displaySmall = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.ExtraBold, fontSize = 32.sp, lineHeight = 40.sp),
    headlineMedium = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.ExtraBold, fontSize = 26.sp, lineHeight = 34.sp),
    titleLarge = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.Bold, fontSize = 21.sp, lineHeight = 28.sp),
    titleMedium = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.Bold, fontSize = 18.sp, lineHeight = 24.sp),
    bodyLarge = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp),
    labelLarge = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, lineHeight = 16.sp),
)

val MamShapes = Shapes(
    small = RoundedCornerShape(MamRadius.Sm),
    medium = RoundedCornerShape(MamRadius.Md),
    large = RoundedCornerShape(MamRadius.Lg),
    extraLarge = RoundedCornerShape(MamRadius.Xl),
)

/** Extra semantic colors not covered by Material roles (source labels, success, etc.). */
@Immutable
data class MamExtraColors(
    val google: Color,
    val googleSoft: Color,
    val primarySoft: Color,
    val secondarySoft: Color,
    val success: Color,
    val textMuted: Color,
    val surfaceMuted: Color,
)

val LocalMamColors = staticCompositionLocalOf {
    MamExtraColors(MamColors.Google, MamColors.GoogleSoft, MamColors.PrimarySoft, MamColors.SecondarySoft, MamColors.Success, MamColors.TextMuted, MamColors.SurfaceMuted)
}

@Composable
fun MamTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val c = if (dark) {
        darkColorScheme(
            primary = MamDarkColors.Primary, onPrimary = MamDarkColors.OnPrimary, secondary = MamDarkColors.Secondary,
            tertiary = MamDarkColors.Accent, background = MamDarkColors.Background, surface = MamDarkColors.Surface,
            onBackground = MamDarkColors.Text, onSurface = MamDarkColors.Text, surfaceVariant = MamDarkColors.SurfaceMuted,
            onSurfaceVariant = MamDarkColors.TextMuted, outline = MamDarkColors.Border, error = MamDarkColors.Danger,
            primaryContainer = MamDarkColors.PrimarySoft, onPrimaryContainer = MamDarkColors.Text,
        )
    } else {
        lightColorScheme(
            primary = MamColors.Primary, onPrimary = MamColors.OnPrimary, secondary = MamColors.Secondary,
            tertiary = MamColors.Accent, background = MamColors.Background, surface = MamColors.Surface,
            onBackground = MamColors.Text, onSurface = MamColors.Text, surfaceVariant = MamColors.SurfaceMuted,
            onSurfaceVariant = MamColors.TextMuted, outline = MamColors.Border, error = MamColors.Danger,
            primaryContainer = MamColors.PrimarySoft, onPrimaryContainer = MamColors.Text,
        )
    }
    val extra = if (dark) {
        MamExtraColors(MamDarkColors.Google, MamDarkColors.GoogleSoft, MamDarkColors.PrimarySoft, MamDarkColors.SecondarySoft, MamDarkColors.Success, MamDarkColors.TextMuted, MamDarkColors.SurfaceMuted)
    } else {
        MamExtraColors(MamColors.Google, MamColors.GoogleSoft, MamColors.PrimarySoft, MamColors.SecondarySoft, MamColors.Success, MamColors.TextMuted, MamColors.SurfaceMuted)
    }
    androidx.compose.runtime.CompositionLocalProvider(LocalMamColors provides extra) {
        MaterialTheme(colorScheme = c, typography = MamTypography, shapes = MamShapes, content = content)
    }
}
