package id.mam.app.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import id.mam.app.di.AppContainer
import id.mam.app.ui.community.*
import id.mam.app.ui.home.HomeScreen
import id.mam.app.ui.home.HomeViewModel
import id.mam.app.ui.place.AddPlaceScreen
import id.mam.app.ui.place.AddPlaceViewModel
import id.mam.app.ui.place.PlaceScreen
import id.mam.app.ui.place.PlaceViewModel
import id.mam.app.ui.review.ReviewFormScreen
import id.mam.app.ui.review.ReviewFormViewModel

object Routes {
    const val HOME = "home"
    const val SURPRISE = "surprise"
    const val FEED = "feed"
    const val PROFILE = "profile"
    const val PLACE = "place/{placeId}"
    const val REVIEW = "place/{placeId}/review"
    const val ADD_PLACE = "add-place"
    fun place(id: String) = "place/$id"
    fun review(id: String) = "place/$id/review"
}

private data class Tab(val route: String, val label: String, val icon: String)
private val TABS = listOf(Tab(Routes.HOME, "Beranda", "🏠"), Tab(Routes.SURPRISE, "Kejutan", "🎲"), Tab(Routes.FEED, "Ulasan", "💬"), Tab(Routes.PROFILE, "Profil", "🙂"))

/** Navigation rail on medium/expanded widths (tablets, foldables), bottom bar on compact phones. */
@Composable
fun MamApp(container: AppContainer, widthClass: WindowWidthSizeClass, nav: NavHostController = rememberNavController()) {
    val entry by nav.currentBackStackEntryAsState()
    val current = entry?.destination?.route
    val showNav = current in TABS.map { it.route }
    val go: (String) -> Unit = { route ->
        nav.navigate(route) {
            popUpTo(nav.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }
    val photoUrl: (String) -> String = { container.places.photoUrl(it) }
    val useRail = widthClass != WindowWidthSizeClass.Compact

    Scaffold(bottomBar = {
        if (showNav && !useRail) NavigationBar {
            TABS.forEach { t -> NavigationBarItem(selected = current == t.route, onClick = { go(t.route) }, icon = { Text(t.icon) }, label = { Text(t.label) }) }
        }
    }) { pad ->
        androidx.compose.foundation.layout.Row(Modifier.padding(pad)) {
            if (showNav && useRail) NavigationRail {
                TABS.forEach { t -> NavigationRailItem(selected = current == t.route, onClick = { go(t.route) }, icon = { Text(t.icon) }, label = { Text(t.label) }) }
            }
            NavHost(nav, startDestination = Routes.HOME) {
                composable(Routes.HOME) {
                    val vm: HomeViewModel = viewModel(factory = viewModelFactory { initializer { HomeViewModel(container.places, container.settings, container.location) } })
                    HomeScreen(vm, photoUrl, onOpenPlace = { nav.navigate(Routes.place(it)) }, onSurprise = { go(Routes.SURPRISE) })
                }
                composable(Routes.SURPRISE) {
                    val vm: SurpriseViewModel = viewModel(factory = viewModelFactory { initializer { SurpriseViewModel(container.places, container.settings, container.location) } })
                    SurpriseScreen(vm, photoUrl) { nav.navigate(Routes.place(it)) }
                }
                composable(Routes.FEED) {
                    val vm: FeedViewModel = viewModel(factory = viewModelFactory { initializer { FeedViewModel(container.reviews) } })
                    FeedScreen(vm) { nav.navigate(Routes.place(it)) }
                }
                composable(Routes.PROFILE) {
                    val vm: ProfileViewModel = viewModel(factory = viewModelFactory { initializer { ProfileViewModel(container.users, container.googleSignIn) } })
                    ProfileScreen(vm, onOpenPlace = { nav.navigate(Routes.place(it)) }, onAddPlace = { nav.navigate(Routes.ADD_PLACE) })
                }
                composable(
                    Routes.PLACE,
                    arguments = listOf(navArgument("placeId") { type = NavType.StringType }),
                    deepLinks = listOf(navDeepLink { uriPattern = "https://mam.id/tempat/{placeId}" }, navDeepLink { uriPattern = "mam://tempat/{placeId}" }),
                ) { back ->
                    val id = back.arguments!!.getString("placeId")!!
                    val vm: PlaceViewModel = viewModel(key = "place-$id", factory = viewModelFactory { initializer { PlaceViewModel(id, container.places, container.reviews, container.users) } })
                    PlaceScreen(vm, photoUrl, onBack = { nav.popBackStack() }, onWriteReview = { pid ->
                        if (container.users.loggedIn.value) nav.navigate(Routes.review(pid)) else go(Routes.PROFILE)
                    })
                }
                composable(Routes.ADD_PLACE) {
                    if (!container.users.loggedIn.value) {
                        androidx.compose.runtime.LaunchedEffect(Unit) { go(Routes.PROFILE) }
                    } else {
                        val vm: AddPlaceViewModel = viewModel(factory = viewModelFactory { initializer { AddPlaceViewModel(container.submissions, container.location) } })
                        AddPlaceScreen(vm, onOpenPlace = { nav.navigate(Routes.place(it)) }, onBack = { nav.popBackStack() })
                    }
                }
                composable(Routes.REVIEW, arguments = listOf(navArgument("placeId") { type = NavType.StringType })) { back ->
                    val id = back.arguments!!.getString("placeId")!!
                    val vm: ReviewFormViewModel = viewModel(key = "review-$id", factory = viewModelFactory { initializer { ReviewFormViewModel(id, container.places, container.reviews) } })
                    ReviewFormScreen(vm, onDone = { nav.popBackStack() }, onBack = { nav.popBackStack() })
                }
            }
        }
    }
}
