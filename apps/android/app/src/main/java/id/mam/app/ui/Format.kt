package id.mam.app.ui

import java.text.NumberFormat
import java.util.Locale

/** Indonesian locale formatting (IDR, comma decimal separator). Pure functions — unit tested. */
object Format {
    private val id = Locale("id", "ID")

    fun idr(v: Int?): String {
        if (v == null) return "—"
        val nf = NumberFormat.getCurrencyInstance(id).apply { maximumFractionDigits = 0; currency = java.util.Currency.getInstance("IDR") }
        return nf.format(v).replace(" ", "")
    }

    fun distance(m: Int?): String = when {
        m == null -> ""
        m < 1000 -> "$m m"
        m < 10_000 -> String.format(id, "%.1f km", m / 1000.0)
        else -> "${m / 1000} km"
    }

    fun rating(v: Double?): String = if (v == null) "—" else String.format(id, "%.1f", v)

    fun radiusLabel(m: Int) = "${m / 1000} km"

    val CATEGORY_LABELS = linkedMapOf(
        "indonesian" to "Indonesia", "japanese" to "Jepang", "korean" to "Korea", "chinese" to "Tionghoa",
        "western" to "Western", "fast-food" to "Cepat Saji", "street-food" to "Kaki Lima", "seafood" to "Seafood",
        "bakery" to "Roti & Kue", "dessert" to "Dessert", "coffee" to "Kopi", "beverages" to "Minuman",
        "vegetarian" to "Vegetarian", "other" to "Lainnya",
    )
}
