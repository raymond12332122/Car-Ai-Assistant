package com.copiloto.copiloto.car

import android.content.Intent
import android.net.Uri
import androidx.car.app.CarContext
import androidx.car.app.CarToast

/** Hands off to the car's navigation app (Google Maps / Waze on Android Auto). */
object CarNavigation {
    fun start(carContext: CarContext, lat: Double, lng: Double, name: String) {
        val label = Uri.encode(name)
        val intent = Intent(CarContext.ACTION_NAVIGATE, Uri.parse("geo:0,0?q=$lat,$lng($label)"))
        try {
            carContext.startCarApp(intent)
        } catch (e: Exception) {
            CarToast.makeText(carContext, "No hay app de navegación disponible", CarToast.LENGTH_LONG).show()
        }
    }
}
