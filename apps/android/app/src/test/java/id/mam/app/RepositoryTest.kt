package id.mam.app

import id.mam.app.data.local.TokenStore
import id.mam.app.data.model.LatLngDto
import id.mam.app.data.remote.AppError
import id.mam.app.data.remote.Network
import id.mam.app.data.repository.DefaultPlacesRepository
import id.mam.app.data.repository.DefaultReviewRepository
import id.mam.app.ui.Format
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class MemoryTokens(var access: String? = null, var refresh: String? = null) : TokenStore {
    override val loggedIn = MutableStateFlow(refresh != null)
    override fun accessToken() = access
    override fun refreshToken() = refresh
    override fun save(access: String, refresh: String) { this.access = access; this.refresh = refresh; loggedIn.value = true }
    override fun clear() { access = null; refresh = null; loggedIn.value = false }
}

class RepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var base: String

    @Before fun setUp() { server = MockWebServer().apply { start() }; base = server.url("/api/v1/").toString() }
    @After fun tearDown() = server.shutdown()

    @Test fun `nearby sends coordinates and radius and parses the response`() = runTest {
        server.enqueue(MockResponse().setBody("""{"center":{"lat":-6.2,"lng":106.8},"radiusMeters":5000,"items":[{"placeId":"ChIJabc","name":"Soto","location":{"lat":-6.2,"lng":106.8},"distanceMeters":120,"google":{"rating":4.5,"userRatingCount":10},"unknownField":true}],"providers":[{"provider":"GOOGLE","ok":true}],"excludedForMissingData":0}"""))
        val repo = DefaultPlacesRepository(Network.create(base, MemoryTokens(), false), base)
        val r = repo.nearby(LatLngDto(-6.2, 106.8), 5000).getOrThrow()
        val req = server.takeRequest()
        assertTrue(req.path!!.contains("radius=5000"))
        assertTrue(req.path!!.contains("lat=-6.2"))
        assertEquals("Soto", r.items.single().name)
        assertEquals(4.5, r.items.single().google.rating!!, 0.0)
        assertNull(r.items.single().community)
    }

    @Test fun `bearer token is attached and refreshed once on 401`() = runTest {
        val tokens = MemoryTokens(access = "old", refresh = "rt-1")
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"statusCode":401,"message":"expired"}"""))
        server.enqueue(MockResponse().setBody("""{"accessToken":"new","refreshToken":"rt-2","expiresIn":900}"""))
        server.enqueue(MockResponse().setBody("""{"restaurantId":"r","reviewCount":3,"averageOverall":4.2}"""))
        val repo = DefaultReviewRepository(Network.create(base, tokens, false))
        val stats = repo.stats("r").getOrThrow()
        assertEquals(3, stats.reviewCount)
        assertEquals("Bearer old", server.takeRequest().getHeader("Authorization"))
        assertTrue(server.takeRequest().path!!.endsWith("auth/refresh"))
        assertEquals("Bearer new", server.takeRequest().getHeader("Authorization"))
        assertEquals("rt-2", tokens.refresh)
    }

    @Test fun `failed refresh clears the session`() = runTest {
        val tokens = MemoryTokens(access = "old", refresh = "revoked")
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(MockResponse().setResponseCode(401))
        val repo = DefaultReviewRepository(Network.create(base, tokens, false))
        assertTrue(repo.stats("r").exceptionOrNull() is AppError.Unauthorized)
        assertNull(tokens.refreshToken())
    }

    @Test fun `409 maps to Conflict with the server message`() = runTest {
        server.enqueue(MockResponse().setResponseCode(409).setBody("""{"statusCode":409,"message":"Kamu sudah pernah mengulas tempat ini."}"""))
        val repo = DefaultReviewRepository(Network.create(base, MemoryTokens("a", "b"), false))
        val e = repo.delete("x").exceptionOrNull()
        assertTrue(e is AppError.Conflict)
        assertEquals("Kamu sudah pernah mengulas tempat ini.", e!!.message)
    }

    @Test fun `network failures map to a friendly offline error`() = runTest {
        server.shutdown()
        val repo = DefaultPlacesRepository(Network.create(base, MemoryTokens(), false), base)
        assertTrue(repo.nearby(LatLngDto(0.0, 0.0), 5000).exceptionOrNull() is AppError.Network)
    }

    @Test fun `indonesian formatting`() {
        assertEquals("850 m", Format.distance(850))
        assertEquals("2,5 km", Format.distance(2500))
        assertEquals("4,5", Format.rating(4.5))
        assertTrue(Format.idr(25000).contains("25.000"))
        assertEquals("5 km", Format.radiusLabel(5000))
    }
}
