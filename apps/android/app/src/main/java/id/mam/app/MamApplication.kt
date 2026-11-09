package id.mam.app

import android.app.Application
import id.mam.app.di.AppContainer
import id.mam.app.di.DefaultAppContainer

class MamApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = DefaultAppContainer(this)
    }
}
