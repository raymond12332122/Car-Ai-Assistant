package com.copiloto.copiloto.car

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import androidx.car.app.CarContext
import androidx.car.app.media.CarAudioRecord
import androidx.car.app.versioning.CarAppApiLevels
import androidx.core.content.ContextCompat
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt

/**
 * Records one utterance from the CAR's microphone (CarAudioRecord, Car API 5+)
 * and returns it as a 16 kHz mono 16-bit WAV. Stops on ~1.2 s of silence after
 * speech, or after [MAX_MS].
 */
class CarVoiceRecorder(private val carContext: CarContext) {

    companion object {
        private const val MAX_MS = 9_000
        private const val MIN_MS = 1_200
        private const val SILENCE_MS = 1_200
        private const val SPEECH_RMS = 900.0
    }

    @Volatile private var cancelled = false

    val isSupported: Boolean
        get() = carContext.carAppApiLevel >= CarAppApiLevels.LEVEL_5

    val hasPermission: Boolean
        get() = ContextCompat.checkSelfPermission(carContext, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    fun cancel() {
        cancelled = true
    }

    /** Blocking — run on a background thread. Returns null if nothing was said. */
    @androidx.annotation.RequiresPermission(Manifest.permission.RECORD_AUDIO)
    fun recordUtterance(): ByteArray? {
        cancelled = false
        val audioManager = carContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            .build()
        audioManager.requestAudioFocus(focus)

        val record = CarAudioRecord.create(carContext)
        val pcm = ByteArrayOutputStream()
        val buffer = ByteArray(CarAudioRecord.AUDIO_CONTENT_BUFFER_SIZE)
        val bytesPerMs = CarAudioRecord.AUDIO_CONTENT_SAMPLING_RATE * 2 / 1000
        var heardSpeech = false
        var silentMs = 0
        try {
            record.startRecording()
            while (!cancelled) {
                val n = record.read(buffer, 0, buffer.size)
                if (n < 0) break
                if (n == 0) continue
                pcm.write(buffer, 0, n)
                val chunkMs = n / bytesPerMs
                if (rms(buffer, n) > SPEECH_RMS) {
                    heardSpeech = true
                    silentMs = 0
                } else {
                    silentMs += chunkMs
                }
                val elapsed = pcm.size() / bytesPerMs
                if (elapsed >= MAX_MS) break
                if (heardSpeech && elapsed >= MIN_MS && silentMs >= SILENCE_MS) break
                if (!heardSpeech && elapsed >= 5_000) break
            }
        } finally {
            record.stopRecording()
            audioManager.abandonAudioFocusRequest(focus)
        }
        if (cancelled || !heardSpeech) return null
        return toWav(pcm.toByteArray(), CarAudioRecord.AUDIO_CONTENT_SAMPLING_RATE)
    }

    private fun rms(buf: ByteArray, len: Int): Double {
        var sum = 0.0
        var count = 0
        var i = 0
        while (i + 1 < len) {
            val s = (buf[i].toInt() and 0xff) or (buf[i + 1].toInt() shl 8)
            sum += s.toDouble() * s
            count++
            i += 2
        }
        return if (count == 0) 0.0 else sqrt(sum / count)
    }

    private fun toWav(pcm: ByteArray, sampleRate: Int): ByteArray {
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray()); putInt(36 + pcm.size); put("WAVE".toByteArray())
            put("fmt ".toByteArray()); putInt(16); putShort(1); putShort(1)
            putInt(sampleRate); putInt(sampleRate * 2); putShort(2); putShort(16)
            put("data".toByteArray()); putInt(pcm.size)
        }
        return header.array() + pcm
    }
}
