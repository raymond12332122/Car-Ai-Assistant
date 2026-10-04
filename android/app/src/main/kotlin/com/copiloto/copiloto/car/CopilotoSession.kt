package com.copiloto.copiloto.car

import android.content.Intent
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** One car connection. Holds shared services and the conversation history. */
class CopilotoSession : Session() {

    companion object {
        const val LANGUAGE = "es-MX"
        private const val MAX_HISTORY = 12
    }

    val client = AssistantClient()
    val executor: ExecutorService = Executors.newSingleThreadExecutor()
    lateinit var speaker: CarSpeaker
        private set
    lateinit var recorder: CarVoiceRecorder
        private set
    lateinit var location: CarLocationProvider
        private set

    private val history = ArrayDeque<Turn>()

    // Same storage the Flutter app's shared_preferences plugin uses, so the
    // model picked on the phone is the one used in the car (and vice versa).
    private val prefs by lazy {
        carContext.getSharedPreferences("FlutterSharedPreferences", android.content.Context.MODE_PRIVATE)
    }

    var selectedModel: String?
        get() = prefs.getString("flutter.copiloto.model", null)
        set(value) {
            prefs.edit().putString("flutter.copiloto.model", value).apply()
        }

    fun historySnapshot(): List<Turn> = synchronized(history) { history.toList() }

    fun remember(user: String, assistant: String) = synchronized(history) {
        history.addLast(Turn("user", user))
        history.addLast(Turn("assistant", assistant))
        while (history.size > MAX_HISTORY) history.removeFirst()
    }

    fun clearHistory() = synchronized(history) { history.clear() }

    override fun onCreateScreen(intent: Intent): Screen {
        speaker = CarSpeaker(carContext, LANGUAGE)
        recorder = CarVoiceRecorder(carContext)
        location = CarLocationProvider(carContext)
        lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onDestroy(owner: LifecycleOwner) {
                recorder.cancel()
                speaker.shutdown()
                executor.shutdownNow()
            }
        })
        return HomeScreen(carContext, this)
    }
}
