package id.mam.app

import id.mam.app.data.model.Author
import id.mam.app.data.model.Ratings
import id.mam.app.data.model.Review
import id.mam.app.ui.review.ReviewForm
import id.mam.app.ui.review.ReviewFormViewModel
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class ReviewFormViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private fun filled(vm: ReviewFormViewModel) = vm.update { ReviewForm(5, 4, 4, 3, 4, "Kuahnya gurih dan baksonya kenyal sekali.", "25000") }

    @Test fun `overall is the mean of the five ratings`() {
        assertEquals(4.0, ReviewForm(5, 4, 4, 3, 4).overall!!, 0.0001)
        assertNull(ReviewForm(5, 4, 0, 3, 4).overall)
    }

    @Test fun `client validation blocks incomplete reviews`() = runTest {
        val reviews = FakeReviews()
        val vm = ReviewFormViewModel("ChIJx", FakePlaces(), reviews)
        vm.submit()
        assertNotNull(vm.state.value.error)
        assertTrue(reviews.created.isEmpty())
    }

    @Test fun `creates a new review with the internal restaurant id`() = runTest {
        val reviews = FakeReviews()
        val vm = ReviewFormViewModel("ChIJx", FakePlaces(), reviews)
        filled(vm)
        vm.submit()
        assertTrue(vm.state.value.done)
        assertEquals("r-1", reviews.created.single().restaurantId)
        assertEquals(25000, reviews.created.single().pricePaid)
    }

    @Test fun `existing review is edited (same id), never duplicated`() = runTest {
        val reviews = FakeReviews().apply {
            existing = Review("rev-9", "r-1", author = Author("u", "b", "B"), ratings = Ratings(3, 3, 3, 3, 3, 3.0), text = "Lumayan enak, tapi agak antre lama.", visitType = "DINE_IN", status = "PUBLISHED", createdAt = "2026-10-01")
        }
        val vm = ReviewFormViewModel("ChIJx", FakePlaces(), reviews)
        assertEquals("rev-9", vm.state.value.existingId)
        assertEquals(3, vm.state.value.form.taste)
        filled(vm)
        vm.submit()
        assertTrue(reviews.created.isEmpty())
        assertEquals("rev-9", reviews.updated.single().first)
    }

    @Test fun `server duplicate conflict is explained to the user`() = runTest {
        val reviews = FakeReviews().apply { conflictOnCreate() }
        val vm = ReviewFormViewModel("ChIJx", FakePlaces(), reviews)
        filled(vm)
        vm.submit()
        assertFalse(vm.state.value.done)
        assertTrue(vm.state.value.error!!.contains("sudah mengulas"))
    }

    @Test fun `rejects unsupported and oversized photos before uploading`() = runTest {
        val vm = ReviewFormViewModel("ChIJx", FakePlaces(), FakeReviews())
        vm.addPhoto(ByteArray(10), "application/x-msdownload", "virus.exe")
        assertTrue(vm.state.value.error!!.contains("Format"))
        vm.addPhoto(ByteArray(9 * 1024 * 1024), "image/jpeg", "big.jpg")
        assertTrue(vm.state.value.error!!.contains("8 MB"))
        vm.addPhoto(ByteArray(100), "image/jpeg", "ok.jpg")
        assertEquals(1, vm.state.value.photos.size)
    }
}
