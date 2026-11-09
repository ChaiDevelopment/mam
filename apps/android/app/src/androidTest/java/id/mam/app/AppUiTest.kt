package id.mam.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented UI/navigation tests. Run on an emulator or device:
 *   gradlew.bat connectedDebugAndroidTest
 * Location permission is intentionally NOT granted, exercising the manual-fallback path.
 */
@RunWith(AndroidJUnit4::class)
class AppUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test fun homeShowsLocationPromptWithoutRequestingPermissionOnLaunch() {
        rule.onNodeWithTag("use-location").assertIsDisplayed()
        rule.onNodeWithTag("manual-location").assertIsDisplayed()
    }

    @Test fun bottomNavigationReachesEveryTab() {
        rule.onNodeWithText("Kejutan").performClick()
        rule.onNodeWithTag("roll").assertIsDisplayed()
        rule.onNodeWithText("Ulasan").performClick()
        rule.onNodeWithTag("feed").assertIsDisplayed()
        rule.onNodeWithText("Profil").performClick()
        rule.onNodeWithTag("login-email").assertIsDisplayed()
        rule.onNodeWithTag("login-password").assertIsDisplayed()
        rule.onNodeWithText("Beranda").performClick()
        rule.onNodeWithTag("home").assertIsDisplayed()
    }

    @Test fun surpriseDefaultsToFiveKilometres() {
        rule.onNodeWithText("Kejutan").performClick()
        rule.onNodeWithText("5 km").assertIsSelected()
    }
}
