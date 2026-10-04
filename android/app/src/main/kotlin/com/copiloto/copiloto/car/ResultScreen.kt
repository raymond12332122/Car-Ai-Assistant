package com.copiloto.copiloto.car

import android.content.Intent
import android.net.Uri
import android.text.SpannableString
import android.text.Spanned
import androidx.car.app.CarContext
import androidx.car.app.CarToast
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.CarLocation
import androidx.car.app.model.Distance
import androidx.car.app.model.DistanceSpan
import androidx.car.app.model.ItemList
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Metadata
import androidx.car.app.model.Place
import androidx.car.app.model.PlaceListMapTemplate
import androidx.car.app.model.PlaceMarker
import androidx.car.app.model.Row
import androidx.car.app.model.Template

/** The assistant's answer: a map list of places, or a message with actions. */
class ResultScreen(
    carContext: CarContext,
    private val session: CopilotoSession,
    private val reply: CarReply,
) : Screen(carContext) {

    override fun onGetTemplate(): Template =
        if (reply.places.isNotEmpty() && !reply.action.canNavigate) placesTemplate() else messageTemplate()

    private fun placesTemplate(): Template {
        val list = ItemList.Builder()
        reply.places.take(6).forEach { p ->
            val row = Row.Builder()
                .setTitle(p.name)
                .setMetadata(
                    Metadata.Builder()
                        .setPlace(
                            Place.Builder(CarLocation.create(p.lat, p.lng))
                                .setMarker(PlaceMarker.Builder().build())
                                .build(),
                        )
                        .build(),
                )
                .setOnClickListener { navigate(p.lat, p.lng, p.name) }
            p.distanceMeters?.let { row.addText(distanceText(it, p.address)) }
                ?: p.address?.let { row.addText(it) }
            list.addItem(row.build())
        }
        return PlaceListMapTemplate.Builder()
            .setTitle(reply.reply.take(60))
            .setHeaderAction(Action.BACK)
            .setItemList(list.build())
            .build()
    }

    private fun messageTemplate(): Template {
        val builder = MessageTemplate.Builder(reply.reply.ifBlank { reply.speech })
            .setTitle(reply.transcript?.takeIf { it.isNotBlank() }?.let { "“$it”" } ?: "Copiloto")
            .setHeaderAction(Action.BACK)
        val a = reply.action
        when {
            a.canNavigate -> builder.addAction(
                Action.Builder()
                    .setTitle("Navegar")
                    .setFlags(Action.FLAG_PRIMARY)
                    .setOnClickListener { navigate(a.lat!!, a.lng!!, a.destinationName ?: "Destino") }
                    .build(),
            )
            a.type == "call" && a.phone != null -> builder.addAction(
                Action.Builder()
                    .setTitle("Llamar")
                    .setFlags(Action.FLAG_PRIMARY)
                    .setOnClickListener { call(a.phone) }
                    .build(),
            )
        }
        builder.addAction(
            Action.Builder()
                .setTitle("Preguntar")
                .setOnClickListener {
                    screenManager.pop()
                    if (session.recorder.isSupported && session.recorder.hasPermission) {
                        screenManager.push(WorkingScreen(carContext, session, WorkingScreen.Job.Voice))
                    }
                }
                .build(),
        )
        return builder.build()
    }

    private fun distanceText(meters: Int, address: String?): CharSequence {
        val distance = if (meters >= 1000) {
            Distance.create(meters / 1000.0, Distance.UNIT_KILOMETERS)
        } else {
            Distance.create(meters.toDouble(), Distance.UNIT_METERS)
        }
        val suffix = address?.let { " · $it" } ?: ""
        return SpannableString(" $suffix").apply {
            setSpan(DistanceSpan.create(distance), 0, 1, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
        }
    }

    private fun navigate(lat: Double, lng: Double, name: String) =
        CarNavigation.start(carContext, lat, lng, name)

    private fun call(phone: String) {
        try {
            carContext.startCarApp(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
        } catch (e: Exception) {
            CarToast.makeText(carContext, "No se pudo llamar", CarToast.LENGTH_LONG).show()
        }
    }
}
