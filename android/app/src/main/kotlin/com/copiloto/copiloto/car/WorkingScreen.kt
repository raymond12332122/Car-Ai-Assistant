package com.copiloto.copiloto.car

import android.annotation.SuppressLint
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Template
import androidx.core.content.ContextCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.Future

/**
 * Shows "Escuchando…" / "Pensando…" while it records (voice) and calls the
 * backend, then replaces itself with the answer.
 */
class WorkingScreen(
    carContext: CarContext,
    private val session: CopilotoSession,
    private val job: Job,
) : Screen(carContext) {

    companion object {
        private val NAV_INTENT = Regex(
            "ll[eé]v|lleva|naveg|\\bruta\\b|dir[ií]g|\\bir a\\b|\\bvamos\\b|v[aá]monos|c[oó]mo llego|llegar a|take me|navigate|directions|drive to|go to",
            RegexOption.IGNORE_CASE,
        )
        private const val NO_NAV_NOTE =
            "(Nota: no pedí navegar ni buscar lugares. Responde de forma conversacional, sin navegación.)"
    }

    sealed interface Job {
        data object Voice : Job
        data class Text(val prompt: String) : Job
    }

    private var phase = if (job is Job.Voice) "Escuchando… habla ahora" else "Pensando…"
    private var task: Future<*>? = null

    init {
        lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onCreate(owner: LifecycleOwner) = start()
            override fun onDestroy(owner: LifecycleOwner) {
                session.recorder.cancel()
                task?.cancel(true)
            }
        })
    }

    @SuppressLint("MissingPermission") // checked by HomeScreen before pushing
    private fun start() {
        session.speaker.stop()
        val main = ContextCompat.getMainExecutor(carContext)
        task = session.executor.submit {
            val result = runCatching {
                val history = session.historySnapshot()
                val fix = session.location.lastFix()
                val (reply, userText) = when (job) {
                    is Job.Text -> session.client.chat(
                        history + Turn("user", job.prompt), fix, CopilotoSession.LANGUAGE, session.selectedModel,
                    ) to job.prompt
                    Job.Voice -> {
                        val wav = session.recorder.recordUtterance()
                            ?: throw AssistantException("No escuché nada. Toca Hablar e inténtalo de nuevo.")
                        main.execute { setPhase("Pensando…") }
                        val r = session.client.voice(wav, history, fix, CopilotoSession.LANGUAGE, session.selectedModel)
                        r to (r.transcript ?: "")
                    }
                }
                guardNavigation(reply, userText, history, fix) to userText
            }
            main.execute { onFinished(result) }
        }
    }

    /**
     * Only navigate when the driver explicitly asked to go somewhere ("llévame",
     * "navega", "ruta"…). Otherwise ask again for a conversational answer — the
     * small free model sometimes jumped to the last gas station on chit-chat.
     */
    private fun guardNavigation(reply: CarReply, userText: String, history: List<Turn>, fix: Fix?): CarReply {
        if (!reply.action.canNavigate || userText.isBlank() || NAV_INTENT.containsMatchIn(userText)) return reply
        val retry = session.client.chat(
            history + Turn("user", "$userText\n\n$NO_NAV_NOTE"), fix, CopilotoSession.LANGUAGE, session.selectedModel,
        )
        val safe = if (retry.action.canNavigate) {
            retry.copy(action = retry.action.copy(type = "none", lat = null, lng = null), places = emptyList())
        } else {
            retry
        }
        return safe.copy(transcript = reply.transcript)
    }

    private fun setPhase(text: String) {
        if (!lifecycle.currentState.isAtLeast(Lifecycle.State.CREATED)) return
        phase = text
        invalidate()
    }

    private fun onFinished(result: Result<Pair<CarReply, String>>) {
        if (!lifecycle.currentState.isAtLeast(Lifecycle.State.CREATED)) return
        val sm = screenManager
        result.onSuccess { (reply, userText) ->
            if (userText.isNotBlank()) session.remember(userText, reply.reply)
            sm.pop()
            sm.push(ResultScreen(carContext, session, reply))
            val action = reply.action
            if (action.canNavigate) {
                // "Inicia la navegación a…": say it, then hand off to Google Maps / Waze
                // on the car screen immediately — no extra tap while driving.
                session.speaker.speak(reply.speech) {
                    CarNavigation.start(carContext, action.lat!!, action.lng!!, action.destinationName ?: "Destino")
                }
            } else {
                session.speaker.speak(reply.speech)
            }
        }.onFailure { e ->
            val message = (e as? AssistantException)?.message ?: "Algo salió mal. Intenta de nuevo."
            session.speaker.speak(message)
            sm.pop()
            sm.push(MessageScreen(carContext, message))
        }
    }

    override fun onGetTemplate(): Template =
        MessageTemplate.Builder(phase)
            .setTitle("Copiloto")
            .setHeaderAction(Action.BACK)
            .setLoading(true)
            .build()
}
