package id.mam.app

import id.mam.app.data.model.CreatePlaceRequest
import id.mam.app.data.model.LatLngDto
import id.mam.app.data.model.PlaceSubmission
import id.mam.app.data.remote.AppError
import id.mam.app.data.repository.SubmissionRepository
import id.mam.app.ui.place.AddPlaceViewModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class FakeSubmissions : SubmissionRepository {
    val sent = mutableListOf<CreatePlaceRequest>()
    var result: Result<PlaceSubmission>? = null
    override suspend fun submit(body: CreatePlaceRequest): Result<PlaceSubmission> {
        sent += body
        return result ?: Result.success(PlaceSubmission(id = "r1", placeId = "mam-r1", name = body.name, location = LatLngDto(body.lat, body.lng), categories = body.categories, status = "PENDING", createdAt = "2026-11-09T00:00:00Z"))
    }
    override suspend fun mine() = Result.success(sent.map { PlaceSubmission(id = "r1", placeId = "mam-r1", name = it.name, location = LatLngDto(it.lat, it.lng), status = "PENDING", createdAt = "x") })
}

class AddPlaceViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    @Test fun validatesNameLocationAndCategoryBeforeSubmitting() {
        val subs = FakeSubmissions()
        val vm = AddPlaceViewModel(subs, FakeLocation())
        vm.setName("ab")
        vm.submit()
        assertEquals("Nama tempat minimal 3 karakter.", vm.state.value.message)
        vm.setName("Warung Bu Tini")
        vm.submit()
        assertEquals("Ketuk peta untuk menandai lokasi tempat.", vm.state.value.message)
        vm.pick(LatLngDto(13.75, 100.5)) // Bangkok
        vm.submit()
        assertEquals("Lokasi harus di wilayah Indonesia.", vm.state.value.message)
        vm.pick(LatLngDto(-7.7829123456, 110.367))
        vm.submit()
        assertEquals("Pilih minimal satu kategori.", vm.state.value.message)
        assertTrue(subs.sent.isEmpty())
    }

    @Test fun submitsAndShowsThePendingSubmission() {
        val subs = FakeSubmissions()
        val vm = AddPlaceViewModel(subs, FakeLocation())
        vm.setName("  Warung Bu Tini ")
        vm.pick(LatLngDto(-7.78291234567, 110.367))
        vm.toggleCategory("indonesian")
        vm.submit()
        assertEquals("Warung Bu Tini", subs.sent.single().name)
        assertEquals(-7.7829123, subs.sent.single().lat, 1e-9)
        assertEquals(listOf("indonesian"), subs.sent.single().categories)
        assertNull(subs.sent.single().address)
        assertEquals("PENDING", vm.state.value.submitted?.status)
        assertEquals(1, vm.state.value.mine.size)
    }

    @Test fun limitsCategoriesToThreeAndShowsServerErrors() {
        val subs = FakeSubmissions().apply { result = Result.failure(AppError.Server(403, "Verifikasi email kamu dulu.")) }
        val vm = AddPlaceViewModel(subs, FakeLocation())
        listOf("indonesian", "coffee", "bakery", "dessert").forEach(vm::toggleCategory)
        assertEquals(setOf("indonesian", "coffee", "bakery"), vm.state.value.categories)
        assertEquals("Maksimal 3 kategori.", vm.state.value.message)
        vm.setName("Kopi Uji")
        vm.pick(LatLngDto(-6.2, 106.8))
        vm.submit()
        assertEquals("Verifikasi email kamu dulu.", vm.state.value.message)
        assertNull(vm.state.value.submitted)
    }
}
