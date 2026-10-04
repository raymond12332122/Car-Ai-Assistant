package com.copiloto.copiloto.car

import android.content.Context
import android.media.AudioAttributes
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/** Reads replies aloud through the car speakers (phone TTS → Android Auto audio). */
class CarSpeaker(context: Context, private val languageTag: String) : TextToSpeech.OnInitListener {

    // Google's engine has the most natural Spanish voices; fall back to the default engine.
    private val tts = TextToSpeech(context.applicationContext, this, "com.google.android.tts")
    private val main = Handler(Looper.getMainLooper())
    private val callbacks = ConcurrentHashMap<String, () -> Unit>()
    private var ready = false
    private var pending: Pair<String, (() -> Unit)?>? = null

    override fun onInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) {
            pending?.second?.let { main.post(it) }
            pending = null
            return
        }
        val locale = Locale.forLanguageTag(languageTag)
        tts.language = locale
        bestSpanishVoice(locale)?.let { tts.voice = it }
        tts.setSpeechRate(1.0f)
        tts.setPitch(1.0f)
        tts.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String) {}
            override fun onDone(utteranceId: String) = finish(utteranceId)
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String) = finish(utteranceId)
            override fun onError(utteranceId: String, errorCode: Int) = finish(utteranceId)
        })
        ready = true
        pending?.let { (text, done) -> speak(text, done) }
        pending = null
    }

    /**
     * Picks an installed Spanish voice: the exact locale first, then
     * Latin-American Spanish, preferring offline, high-quality voices. Without
     * this some phones read Spanish with an English voice.
     */
    private fun bestSpanishVoice(locale: Locale): Voice? = runCatching {
        tts.voices
            .filter { it.locale.language == "es" }
            .filterNot { it.features?.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) == true }
            .maxByOrNull { v ->
                var score = 0
                if (v.locale.country == locale.country) score += 100
                if (v.locale.country == "US" || v.locale.country == "419") score += 60
                if (!v.isNetworkConnectionRequired) score += 20
                score + v.quality / 100
            }
    }.getOrNull()

    private fun finish(utteranceId: String) {
        callbacks.remove(utteranceId)?.let { main.post(it) }
    }

    /** Speaks [text]; [onDone] runs on the main thread when it ends (or fails). */
    fun speak(text: String, onDone: (() -> Unit)? = null) {
        if (text.isBlank()) {
            onDone?.let { main.post(it) }
            return
        }
        if (!ready) {
            pending = text to onDone
            return
        }
        val id = "copiloto-${System.nanoTime()}"
        if (onDone != null) {
            var fired = false
            val once = { if (!fired) { fired = true; onDone() } }
            callbacks[id] = once
            // Never block the hand-off on a stuck TTS engine.
            main.postDelayed({ callbacks.remove(id); once() }, 6_000)
        }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id)
    }

    fun stop() {
        pending = null
        if (ready) tts.stop()
    }

    fun shutdown() {
        tts.shutdown()
    }
}
