package id.mam.app

import id.mam.app.data.remote.ServerConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ServerConfigTest {
    @Test fun normalizesBareIpsAndUrlsToTheApiBase() {
        assertEquals("http://192.168.1.5:4000/api/v1/", ServerConfig.normalize("192.168.1.5"))
        assertEquals("http://192.168.1.5:4100/api/v1/", ServerConfig.normalize(" 192.168.1.5:4100 "))
        assertEquals("http://10.0.2.2:4000/api/v1/", ServerConfig.normalize("http://10.0.2.2:4000/api/v1/"))
        assertEquals("https://api.mam.id/api/v1/", ServerConfig.normalize("https://api.mam.id"))
    }

    @Test fun rejectsGarbage() {
        assertNull(ServerConfig.normalize(""))
        assertNull(ServerConfig.normalize("bukan url"))
        assertNull(ServerConfig.normalize("ftp://x"))
    }
}
