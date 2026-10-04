package com.copiloto.copiloto.car

import android.Manifest
import androidx.annotation.DrawableRes
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarColor
import androidx.car.app.model.CarIcon
import androidx.car.app.model.GridItem
import androidx.car.app.model.GridTemplate
import androidx.car.app.model.ItemList
import androidx.car.app.model.Template
import androidx.core.graphics.drawable.IconCompat
import com.copiloto.copiloto.R

/** Home grid: one big "Hablar" tile plus one-tap shortcuts (no typing in the car). */
class HomeScreen(carContext: CarContext, private val session: CopilotoSession) : Screen(carContext) {

    private data class Shortcut(val label: String, @DrawableRes val icon: Int, val prompt: String)

    private val shortcuts = listOf(
        Shortcut("Gasolina", R.drawable.ic_car_fuel, "Busca la gasolinera más cercana"),
        Shortcut("Cargador", R.drawable.ic_car_ev, "Busca un cargador para auto eléctrico cerca"),
        Shortcut("Comida", R.drawable.ic_car_food, "¿Dónde puedo comer cerca?"),
        Shortcut("Estacionar", R.drawable.ic_car_parking, "Busca estacionamiento cerca"),
        Shortcut("Taller", R.drawable.ic_car_repair, "Busca un taller mecánico cercano"),
        Shortcut("Hospital", R.drawable.ic_car_hospital, "¿Cuál es el hospital más cercano?"),
        Shortcut("Clima", R.drawable.ic_car_weather, "¿Cómo está el clima aquí hoy?"),
    )

    private fun icon(@DrawableRes res: Int, tint: CarColor? = null): CarIcon =
        CarIcon.Builder(IconCompat.createWithResource(carContext, res)).apply {
            tint?.let { setTint(it) }
        }.build()

    override fun onGetTemplate(): Template {
        val items = ItemList.Builder()
        items.addItem(
            GridItem.Builder()
                .setTitle("Hablar")
                .setText(if (session.recorder.isSupported) "Pregunta lo que sea" else "Requiere Android Auto reciente")
                .setImage(icon(R.drawable.ic_car_mic, CarColor.BLUE), GridItem.IMAGE_TYPE_LARGE)
                .setOnClickListener { startVoice() }
                .build(),
        )
        shortcuts.forEach { s ->
            items.addItem(
                GridItem.Builder()
                    .setTitle(s.label)
                    .setImage(icon(s.icon), GridItem.IMAGE_TYPE_ICON)
                    .setOnClickListener { ask(s.prompt) }
                    .build(),
            )
        }
        return GridTemplate.Builder()
            .setTitle("Copiloto")
            .setHeaderAction(Action.APP_ICON)
            .setSingleList(items.build())
            .setActionStrip(
                ActionStrip.Builder()
                    .addAction(
                        Action.Builder()
                            .setTitle("Modelo")
                            .setOnClickListener { screenManager.push(ModelScreen(carContext, session)) }
                            .build(),
                    )
                    .addAction(
                        Action.Builder()
                            .setTitle("Nueva")
                            .setOnClickListener {
                                session.clearHistory()
                                session.speaker.stop()
                            }
                            .build(),
                    )
                    .build(),
            )
            .build()
    }

    private fun ask(prompt: String) {
        ensurePermissions(needMic = false) {
            screenManager.push(WorkingScreen(carContext, session, WorkingScreen.Job.Text(prompt)))
        }
    }

    private fun startVoice() {
        if (!session.recorder.isSupported) {
            screenManager.push(
                MessageScreen(
                    carContext,
                    "Tu versión de Android Auto no permite usar el micrófono del auto. Usa los accesos rápidos o actualiza Android Auto.",
                ),
            )
            return
        }
        ensurePermissions(needMic = true) {
            screenManager.push(WorkingScreen(carContext, session, WorkingScreen.Job.Voice))
        }
    }

    /** Runtime permissions are granted on the phone screen (parked). */
    private fun ensurePermissions(needMic: Boolean, then: () -> Unit) {
        val missing = buildList {
            if (needMic && !session.recorder.hasPermission) add(Manifest.permission.RECORD_AUDIO)
            if (!session.location.hasPermission) add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        if (missing.isEmpty()) {
            then()
            return
        }
        carContext.requestPermissions(missing) { granted, _ ->
            if (!needMic || granted.contains(Manifest.permission.RECORD_AUDIO) || session.recorder.hasPermission) {
                then()
            } else {
                screenManager.push(
                    MessageScreen(carContext, "Copiloto necesita permiso de micrófono. Acéptalo en tu teléfono cuando estés estacionado."),
                )
            }
        }
    }
}
