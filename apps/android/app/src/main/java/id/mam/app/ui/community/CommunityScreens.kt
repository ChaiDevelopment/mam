package id.mam.app.ui.community

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import id.mam.app.BuildConfig
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.mam.app.data.model.RADIUS_OPTIONS_METERS
import id.mam.app.ui.Format
import id.mam.app.ui.components.*
import id.mam.app.ui.place.ReviewItem
import id.mam.app.ui.theme.LocalMamColors

@Composable
fun FeedScreen(vm: FeedViewModel, onOpenPlace: (String) -> Unit) {
    val s by vm.state.collectAsStateWithLifecycle()
    LazyColumn(Modifier.fillMaxSize().testTag("feed"), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("Ulasan komunitas", style = MaterialTheme.typography.headlineMedium) }
        if (s.error != null && s.items.isEmpty()) item { ErrorState(s.error!!, vm::refresh) }
        if (!s.loading && s.error == null && s.items.isEmpty()) item { EmptyState("Belum ada ulasan", "Jadilah yang pertama berbagi pengalaman!") }
        items(s.items, key = { it.id }) { r ->
            Column {
                r.restaurantName?.let { name ->
                    Text("📍 $name", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.clickable { (r.placeKey ?: r.googlePlaceId)?.let(onOpenPlace) }.padding(vertical = 4.dp))
                }
                ReviewItem(r, onHelpful = {}, onReport = {})
            }
        }
        if (s.loading) items(3) { SkeletonCard() }
        if (s.hasMore && !s.loading) item { OutlinedButton(onClick = vm::more, modifier = Modifier.fillMaxWidth()) { Text("Muat lebih banyak") } }
    }
}

@Composable
fun SurpriseScreen(vm: SurpriseViewModel, photoUrl: (String) -> String, onOpenPlace: (String) -> Unit) {
    val s by vm.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Text("🎲 Surprise me!", style = MaterialTheme.typography.headlineMedium)
            Text("Satu rekomendasi acak yang tetap relevan, lengkap dengan alasannya.", style = MaterialTheme.typography.bodyMedium)
        }
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(RADIUS_OPTIONS_METERS) { r -> FilterChip(selected = s.radius == r, onClick = { vm.setRadius(r) }, label = { Text(Format.radiusLabel(r)) }, shape = RoundedCornerShape(999.dp)) }
        }
        FilterChipRow(Format.CATEGORY_LABELS.toList(), s.categories, vm::toggle)
        Button(onClick = vm::roll, enabled = !s.rolling, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).testTag("roll")) {
            Text(if (s.rolling) "Mengocok…" else if (s.result == null) "Pilihkan untukku!" else "Kocok lagi")
        }
        s.error?.let { Notice(it, Modifier.padding(horizontal = 16.dp)) }
        s.result?.let { r ->
            r.providers.firstOrNull { !it.ok }?.message?.let { Notice(it, Modifier.padding(horizontal = 16.dp)) }
            if (r.pick == null) EmptyState("Tidak ada kandidat", "Longgarkan filter atau perbesar radius.")
            else {
                Box(Modifier.padding(horizontal = 16.dp)) { PlaceCard(r.pick, photoUrl) { onOpenPlace(r.pick.placeId) } }
                Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Kenapa tempat ini?", style = MaterialTheme.typography.titleMedium)
                        r.reasons.forEach { Text("✓ ${it.text}", style = MaterialTheme.typography.bodyMedium) }
                        Text("Skor ${"%.2f".format(r.score ?: 0.0)} dari ${r.candidatesConsidered} kandidat.", style = MaterialTheme.typography.labelMedium, color = LocalMamColors.current.textMuted)
                    }
                }
            }
        }
    }
}

@Composable
fun ProfileScreen(vm: ProfileViewModel, onOpenPlace: (String) -> Unit, onAddPlace: () -> Unit = {}) {
    val s by vm.state.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    var newCollection by remember { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf(false) }
    LaunchedEffect(s.message) { s.message?.let { snackbar.showSnackbar(it); vm.messageShown() } }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { pad ->
        if (!s.loggedIn) {
            val challenge = s.mfa
            if (challenge != null) {
                MfaCodeForm(challenge, s.loading, onVerify = vm::verifyCode, onResend = vm::resendCode, onCancel = vm::cancelMfa, modifier = Modifier.padding(pad))
                return@Scaffold
            }
            LoginForm(
                loading = s.loading,
                googleAvailable = BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank(),
                onLogin = vm::loginWithPassword,
                onRegister = vm::register,
                onGoogle = { vm.signIn(ctx) },
                onForgotPassword = vm::forgotPassword,
                modifier = Modifier.padding(pad),
            )
            return@Scaffold
        }
        LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            s.me?.let { me ->
                if (!me.emailVerified) item {
                    Card(colors = CardDefaults.cardColors(containerColor = LocalMamColors.current.secondarySoft), modifier = Modifier.testTag("verify-banner")) {
                        Column(Modifier.padding(12.dp)) {
                            Text("📧 Verifikasi email ${me.email}", style = MaterialTheme.typography.titleSmall)
                            Text("Diperlukan untuk menulis ulasan dan menambahkan tempat. Buka tautan di email dari MAM!.", style = MaterialTheme.typography.bodyMedium)
                            TextButton(onClick = vm::resendVerification, contentPadding = PaddingValues(0.dp)) { Text("Kirim ulang email verifikasi") }
                        }
                    }
                }
            }
            item { OutlinedButton(onClick = onAddPlace, modifier = Modifier.fillMaxWidth().testTag("open-add-place")) { Text("➕ Tambah tempat makan") } }
            s.me?.let { me ->
                item {
                    Text(me.displayName, style = MaterialTheme.typography.headlineMedium)
                    Text("@${me.username} · ${me.stats.reviewCount} ulasan · ${me.stats.helpfulReceived} 👍 · ${s.unread} notifikasi baru", style = MaterialTheme.typography.bodyMedium)
                    if (me.badges.isNotEmpty()) Text(me.badges.joinToString("  ") { "🏅 ${it.name}" }, style = MaterialTheme.typography.labelLarge)
                }
            }
            if (s.loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            item { Text("❤️ Favorit", style = MaterialTheme.typography.titleLarge) }
            if (s.favorites.isEmpty()) item { Text("Belum ada favorit.", style = MaterialTheme.typography.bodyMedium) }
            items(s.favorites, key = { it.restaurant.id }) { f ->
                Text(
                    "${f.restaurant.name ?: "Nama tidak tersedia"} · MAM! ${Format.rating(f.restaurant.stats.averageOverall)}",
                    modifier = Modifier.fillMaxWidth().clickable { f.restaurant.routeKey?.let(onOpenPlace) }.padding(vertical = 8.dp),
                )
            }
            item { Text("📚 Koleksi", style = MaterialTheme.typography.titleLarge) }
            items(s.collections, key = { it.id }) { c -> Text("${c.name} (${c.itemCount} tempat)${if (c.isPublic) " · publik" else ""}", modifier = Modifier.padding(vertical = 6.dp)) }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(newCollection, { newCollection = it.take(60) }, label = { Text("Koleksi baru") }, singleLine = true, modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = { vm.createCollection(newCollection); newCollection = "" }) { Text("Buat") }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = vm::logout) { Text("Keluar") }
                    TextButton(onClick = { confirmDelete = true }) { Text("Hapus akun", color = MaterialTheme.colorScheme.error) }
                }
            }
            item { ServerSettingsCard() }
        }
    }
    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Hapus akun permanen?") },
        text = { Text("Profil, favorit, koleksi, dan foto dihapus. Ulasan disembunyikan segera dan isinya dihapus setelah 30 hari.") },
        confirmButton = { TextButton(onClick = { confirmDelete = false; vm.deleteAccount() }) { Text("Hapus akun") } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Batal") } },
    )
}

/** Email + password login / registration. Google sign-in is shown only when the build has a client ID. */
@Composable
private fun LoginForm(
    loading: Boolean,
    googleAvailable: Boolean,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String, String) -> Unit,
    onGoogle: () -> Unit,
    onForgotPassword: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    var register by rememberSaveable { mutableStateOf(false) }
    var forgotOpen by remember { mutableStateOf(false) }
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var show by remember { mutableStateOf(false) }
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("🍜", style = MaterialTheme.typography.displaySmall)
        Text(if (register) "Daftar di MAM!" else "Masuk ke MAM!", style = MaterialTheme.typography.headlineMedium)
        Text("Simpan favorit, buat koleksi, dan tulis ulasan.", style = MaterialTheme.typography.bodyMedium)
        if (register) {
            OutlinedTextField(name, { name = it.take(60) }, label = { Text("Nama tampilan") }, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("register-name"))
        }
        OutlinedTextField(
            email, { email = it.trim() }, label = { Text("Email") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth().testTag("login-email"),
        )
        OutlinedTextField(
            password, { password = it.take(128) }, label = { Text(if (register) "Kata sandi (min. 8 karakter)" else "Kata sandi") }, singleLine = true,
            visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            trailingIcon = { TextButton(onClick = { show = !show }) { Text(if (show) "Sembunyi" else "Lihat") } },
            modifier = Modifier.fillMaxWidth().testTag("login-password"),
        )
        Button(
            onClick = { if (register) onRegister(email, password, name) else onLogin(email, password) },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth().testTag("login-submit"),
        ) { Text(if (loading) "Memproses…" else if (register) "Buat akun" else "Masuk") }
        TextButton(onClick = { register = !register }) { Text(if (register) "Sudah punya akun? Masuk" else "Belum punya akun? Daftar gratis") }
        if (!register) TextButton(onClick = { forgotOpen = true }, modifier = Modifier.testTag("forgot-password")) { Text("Lupa kata sandi?") }
        if (forgotOpen) {
            var forgotEmail by remember { mutableStateOf(email) }
            AlertDialog(
                onDismissRequest = { forgotOpen = false },
                title = { Text("Lupa kata sandi") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Kami akan mengirim tautan untuk membuat kata sandi baru ke email akunmu.")
                        OutlinedTextField(forgotEmail, { forgotEmail = it.trim() }, label = { Text("Email") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                    }
                },
                confirmButton = { TextButton(onClick = { onForgotPassword(forgotEmail); forgotOpen = false }) { Text("Kirim tautan") } },
                dismissButton = { TextButton(onClick = { forgotOpen = false }) { Text("Batal") } },
            )
        }
        if (googleAvailable) {
            HorizontalDivider()
            OutlinedButton(onClick = onGoogle, enabled = !loading, modifier = Modifier.fillMaxWidth().testTag("google-sign-in")) { Text("Masuk dengan Google") }
            Text("Login Google hanya untuk akun MAM!. Ulasan MAM! tidak dipublikasikan ke Google Maps.", style = MaterialTheme.typography.labelMedium, color = LocalMamColors.current.textMuted)
        }
        ServerSettingsCard()
    }
}

/** Second login step for staff accounts: the 6-digit code e-mailed to the account. */
@Composable
private fun MfaCodeForm(
    challenge: id.mam.app.data.model.MfaChallenge,
    loading: Boolean,
    onVerify: (String) -> Unit,
    onResend: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var code by rememberSaveable { mutableStateOf("") }
    Column(
        modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Verifikasi akun staf", style = MaterialTheme.typography.headlineSmall)
        Text("Kode 6 angka sudah dikirim ke ${challenge.emailHint}. Berlaku 10 menit.", style = MaterialTheme.typography.bodyMedium)
        challenge.devCode?.let { Text("Mode pengembangan (SMTP belum diatur): kode = $it", style = MaterialTheme.typography.labelMedium, color = LocalMamColors.current.textMuted) }
        OutlinedTextField(
            code, { v -> code = v.filter { it.isDigit() }.take(6) }, label = { Text("Kode verifikasi") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth().testTag("mfa-code"),
        )
        Button(onClick = { onVerify(code) }, enabled = !loading && code.length == 6, modifier = Modifier.fillMaxWidth().testTag("mfa-submit")) {
            Text(if (loading) "Memeriksa…" else "Verifikasi")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = onResend) { Text("Kirim ulang kode") }
            TextButton(onClick = onCancel) { Text("Batal") }
        }
    }
}
