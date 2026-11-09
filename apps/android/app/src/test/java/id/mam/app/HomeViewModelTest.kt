package id.mam.app

import id.mam.app.data.model.LatLngDto
import id.mam.app.data.remote.AppError
import id.mam.app.location.LocationResult
import id.mam.app.ui.home.HomeViewModel
import id.mam.app.ui.home.LocationState
import id.mam.app.ui.home.ResultsState
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class HomeViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    @Test fun `default radius is exactly 5 km`() = runTest {
        val vm = HomeViewModel(FakePlaces(), FakeSettings(), FakeLocation())
        assertEquals(5000, vm.state.value.radius)
    }

    @Test fun `does not request location until permission is granted by the user`() = runTest {
        val loc = FakeLocation(granted = false)
        val vm = HomeViewModel(FakePlaces(), FakeSettings(), loc)
        assertEquals(0, loc.calls)
        assertEquals(LocationState.Idle, vm.state.value.location)
    }

    @Test fun `granted permission loads nearby places with the default radius`() = runTest {
        val places = FakePlaces()
        val vm = HomeViewModel(places, FakeSettings(), FakeLocation(granted = true))
        val r = vm.state.value.results as ResultsState.Success
        assertEquals(2, r.items.size)
        assertEquals(5000, places.nearbyCalls.single().second)
    }

    @Test fun `changing radius persists the preference and reloads`() = runTest {
        val places = FakePlaces()
        val settings = FakeSettings()
        val vm = HomeViewModel(places, settings, FakeLocation(granted = true))
        vm.setRadius(2000)
        assertEquals(2000, settings.flow.value)
        assertEquals(2000, places.nearbyCalls.last().second)
    }

    @Test fun `denied permission shows a manual fallback message`() = runTest {
        val vm = HomeViewModel(FakePlaces(), FakeSettings(), FakeLocation())
        vm.onPermissionResult(false)
        val s = vm.state.value.location as LocationState.Problem
        assertTrue(s.message.contains("manual"))
    }

    @Test fun `location timeout and disabled services are handled`() = runTest {
        val loc = FakeLocation(granted = true, result = LocationResult.Timeout)
        val vm = HomeViewModel(FakePlaces(), FakeSettings(), loc)
        assertTrue((vm.state.value.location as LocationState.Problem).message.contains("terlalu lama"))
        loc.result = LocationResult.ServicesDisabled
        vm.locate()
        assertTrue((vm.state.value.location as LocationState.Problem).message.contains("GPS"))
    }

    @Test fun `manual center triggers search around the chosen area`() = runTest {
        val places = FakePlaces()
        val vm = HomeViewModel(places, FakeSettings(), FakeLocation())
        vm.setManualCenter(LatLngDto(-6.9, 107.6), "Bandung")
        assertEquals(LatLngDto(-6.9, 107.6), places.nearbyCalls.single().first)
    }

    @Test fun `network failure surfaces an error state that can be retried`() = runTest {
        val places = FakePlaces().apply { nearbyResult = Result.failure(AppError.Network()) }
        val vm = HomeViewModel(places, FakeSettings(), FakeLocation(granted = true))
        assertTrue(vm.state.value.results is ResultsState.Error)
        places.nearbyResult = FakePlaces().nearbyResult
        vm.load()
        assertTrue(vm.state.value.results is ResultsState.Success)
    }

    @Test fun `category toggle is sent to the API`() = runTest {
        val places = FakePlaces()
        val vm = HomeViewModel(places, FakeSettings(), FakeLocation(granted = true))
        vm.toggleCategory("japanese")
        assertEquals(listOf("japanese"), places.nearbyCalls.last().third)
    }
}
