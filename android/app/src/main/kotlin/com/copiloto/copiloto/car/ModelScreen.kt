package com.copiloto.copiloto.car

import androidx.car.app.CarContext
import androidx.car.app.CarToast
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle

/** Pick the AI model (Claude / ChatGPT) from the car screen. */
class ModelScreen(carContext: CarContext, private val session: CopilotoSession) : Screen(carContext) {

    private var models: List<ModelOption>? = null
    private var error: String? = null

    init {
        val main = ContextCompat.getMainExecutor(carContext)
        session.executor.execute {
            val result = runCatching { session.client.models() }
            main.execute {
                if (!lifecycle.currentState.isAtLeast(Lifecycle.State.CREATED)) return@execute
                result.onSuccess { models = it }.onFailure { error = it.message }
                invalidate()
            }
        }
    }

    override fun onGetTemplate(): Template {
        val builder = ListTemplate.Builder()
            .setTitle("Modelo de IA")
            .setHeaderAction(Action.BACK)
        val list = models
        if (list == null && error == null) return builder.setLoading(true).build()

        val items = ItemList.Builder()
        if (list == null) {
            items.setNoItemsMessage(error ?: "Sin conexión")
        } else {
            val current = session.selectedModel
            list.forEach { m ->
                val row = Row.Builder()
                    .setTitle(if (m.id == current) "✓ ${m.label}" else m.label)
                    .addText(if (m.available) m.note else "Falta conectar la llave de API")
                    .setEnabled(m.available)
                if (m.available) {
                    row.setOnClickListener {
                        session.selectedModel = m.id
                        CarToast.makeText(carContext, "Usando ${m.label}", CarToast.LENGTH_SHORT).show()
                        screenManager.pop()
                    }
                }
                items.addItem(row.build())
            }
        }
        return builder.setSingleList(items.build()).build()
    }
}
