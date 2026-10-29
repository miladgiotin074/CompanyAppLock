package com.company.applock.sync

import com.company.applock.core.ServerConfig
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Thin REST client built on the platform's HttpURLConnection — no third-party
 * HTTP library in the APK. On Android this is backed by the system network
 * stack, which keeps its own connection pool and transparently gzips responses,
 * so dropping OkHttp/Okio costs us nothing at runtime while shrinking the APK.
 *
 * Only POST and PUT are issued (see SyncEngine), both fully supported here.
 */
object ApiClient {
    private const val CONNECT_TIMEOUT_MS = 15_000
    private const val READ_TIMEOUT_MS = 20_000

    data class Resp(val code: Int, val body: String?) {
        val ok: Boolean get() = code in 200..299
    }

    fun send(path: String, method: String, json: String, idempotencyKey: String?): Resp {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(ServerConfig.baseUrl + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                useCaches = false
                doInput = true
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Accept", "application/json")
                setRequestProperty("ngrok-skip-browser-warning", "true") // skip ngrok's interstitial
                if (idempotencyKey != null) setRequestProperty("Idempotency-Key", idempotencyKey)
            }
            conn.outputStream.use { it.write(json.toByteArray(Charsets.UTF_8)) }

            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
            Resp(code, body)
        } catch (_: IOException) {
            Resp(0, null) // network failure → treated as retryable
        } catch (_: Exception) {
            Resp(0, null)
        } finally {
            conn?.disconnect()
        }
    }
}
