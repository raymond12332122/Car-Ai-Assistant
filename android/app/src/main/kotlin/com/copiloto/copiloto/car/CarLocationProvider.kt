package com.copiloto.copiloto.car

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat

/** Best recent location from the phone (no Play Services dependency). */
class CarLocationProvider(private val context: Context) {

    val hasPermission: Boolean
        get() = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    @Suppress("MissingPermission")
    fun lastFix(): Fix? {
        if (!hasPermission) return null
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val best: Location? = lm.getProviders(true)
            .mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
            .maxByOrNull { it.time }
        return best?.let {
            Fix(it.latitude, it.longitude, if (it.hasSpeed()) it.speed * 3.6 else null)
        }
    }
}
