package com.copiloto.copiloto.car

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Template

/** Simple informational screen with a back button. */
class MessageScreen(carContext: CarContext, private val message: String) : Screen(carContext) {
    override fun onGetTemplate(): Template =
        MessageTemplate.Builder(message)
            .setTitle("Copiloto")
            .setHeaderAction(Action.BACK)
            .addAction(Action.Builder().setTitle("OK").setOnClickListener { screenManager.pop() }.build())
            .build()
}
