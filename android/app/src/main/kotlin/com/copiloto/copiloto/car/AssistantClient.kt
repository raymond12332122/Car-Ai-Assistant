package com.copiloto.copiloto.car

import android.util.Base64
import com.copiloto.copiloto.BuildConfig
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

data class CarPlace(
    val name: String,
    val lat: Double,
    val lng: Double,
    val distanceMeters: Int?,
    val address: String?,
    val phone: String?,
)

data class CarAction(
    val type: String,
    val destinationName: String?,
    val lat: Double?,
    val lng: Double?,
    val address: String?,
    val phone: String?,
) {
    val canNavigate get() = type == "navigate" && lat != null && lng != null
}

data class CarReply(
    val reply: String,
    val speech: String,
    val action: CarAction,
    val places: List<CarPlace>,
    val transcript: String?,
)

data class ModelOption(val id: String, val label: String, val note: String, val available: Boolean)

data class Turn(val role: String, val content: String)

data class Fix(val lat: Double, val lng: Double, val speedKmh: Double?)

class AssistantException(message: String, val code: String? = null) : IOException(message)

/**
 * Blocking client for the Floot backend. Call from a background thread.
 * Floot responses are superjson envelopes: `{"json": {...}}`.
 */
class AssistantClient(private val baseUrl: String = BuildConfig.BACKEND_URL) {

    fun chat(history: List<Turn>, location: Fix?, language: String, model: String?): CarReply {
        val body = JSONObject()
            .put("messages", history.toJson())
            .put("language", language)
            .put("surface", "car")
        model?.let { body.put("model", it) }
        location?.let { body.put("location", it.toJson()) }
        return post("/_api/assistant/chat", body)
    }

    fun voice(wav: ByteArray, history: List<Turn>, location: Fix?, language: String, model: String?): CarReply {
        val body = JSONObject()
            .put("audioBase64", Base64.encodeToString(wav, Base64.NO_WRAP))
            .put("mimeType", "audio/wav")
            .put("history", history.takeLast(19).toJson())
            .put("language", language)
            .put("surface", "car")
        model?.let { body.put("model", it) }
        location?.let { body.put("location", it.toJson()) }
        return post("/_api/assistant/voice", body)
    }

    fun models(): List<ModelOption> {
        val conn = (URL("$baseUrl/_api/assistant/models").openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 20_000
        }
        try {
            if (conn.responseCode != 200) throw AssistantException("No se pudo cargar la lista de modelos.")
            val raw = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
            val arr = (raw.optJSONObject("json") ?: raw).optJSONArray("models") ?: JSONArray()
            return (0 until arr.length()).map { i ->
                val m = arr.getJSONObject(i)
                ModelOption(m.getString("id"), m.getString("label"), m.optString("note"), m.optBoolean("available"))
            }
        } catch (e: AssistantException) {
            throw e
        } catch (e: Exception) {
            throw AssistantException("Sin conexión. Revisa los datos del teléfono.")
        } finally {
            conn.disconnect()
        }
    }

    private fun post(path: String, body: JSONObject): CarReply {
        val conn = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 60_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        try {
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            val raw = runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            val json = raw.optJSONObject("json") ?: raw
            if (status !in 200..299) {
                val code = json.optString("code").ifEmpty { null }
                val message = if (code == "OUT_OF_CREDITS") {
                    "El asistente no está disponible por ahora."
                } else {
                    json.optString("error").ifEmpty { "Error $status" }
                }
                throw AssistantException(message, code)
            }
            return parse(json)
        } catch (e: AssistantException) {
            throw e
        } catch (e: IOException) {
            throw AssistantException("Sin conexión. Revisa los datos del teléfono.")
        } finally {
            conn.disconnect()
        }
    }

    private fun parse(json: JSONObject): CarReply {
        val a = json.optJSONObject("action") ?: JSONObject()
        val places = json.optJSONArray("places") ?: JSONArray()
        return CarReply(
            reply = json.optString("reply"),
            speech = json.optString("speech").ifEmpty { json.optString("reply") },
            action = CarAction(
                type = a.optString("type", "none"),
                destinationName = a.optStringOrNull("destinationName"),
                lat = a.optDoubleOrNull("lat"),
                lng = a.optDoubleOrNull("lng"),
                address = a.optStringOrNull("address"),
                phone = a.optStringOrNull("phone"),
            ),
            places = (0 until places.length()).map { i ->
                val p = places.getJSONObject(i)
                CarPlace(
                    name = p.optString("name"),
                    lat = p.getDouble("lat"),
                    lng = p.getDouble("lng"),
                    distanceMeters = p.optDoubleOrNull("distanceMeters")?.toInt(),
                    address = p.optStringOrNull("address"),
                    phone = p.optStringOrNull("phone"),
                )
            },
            transcript = json.optStringOrNull("transcript"),
        )
    }

    private fun List<Turn>.toJson() = JSONArray().also { arr ->
        forEach { arr.put(JSONObject().put("role", it.role).put("content", it.content)) }
    }

    private fun Fix.toJson() = JSONObject().put("lat", lat).put("lng", lng).also {
        if (speedKmh != null) it.put("speedKmh", speedKmh)
    }

    private fun JSONObject.optStringOrNull(key: String): String? =
        if (isNull(key)) null else optString(key).ifEmpty { null }

    private fun JSONObject.optDoubleOrNull(key: String): Double? =
        if (isNull(key) || !has(key)) null else optDouble(key).takeUnless { it.isNaN() }
}
