package com.company.applock.sync

import android.content.Context
import com.company.applock.core.Constants
import com.company.applock.core.DeviceInfo
import com.company.applock.core.PortConfig
import com.company.applock.core.Prefs
import com.company.applock.core.ServerConfig
import com.company.applock.icon.FirstActionController
import com.company.applock.lockengine.LockController
import com.company.applock.lockengine.LockService
import com.company.applock.sync.db.AppDb
import com.company.applock.sync.db.OutboxEntity
import com.company.applock.watchdog.WatchdogScheduler
import java.util.UUID
import kotlin.math.min
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * Durable outbound sync engine. Every server-bound request is persisted first,
 * then delivered with at-least-once semantics + server idempotency. Collapsible
 * state messages are last-writer-wins so a long offline period never floods the
 * server with stale snapshots. Nothing bypasses this engine.
 */
class SyncEngine private constructor(private val ctx: Context) {

    private val prefs = Prefs.get(ctx)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val flushLock = Mutex()

    companion object {
        @Volatile
        private var instance: SyncEngine? = null

        fun get(ctx: Context): SyncEngine =
            instance ?: synchronized(this) {
                instance ?: SyncEngine(ctx.applicationContext).also { instance = it }
            }
    }

    private val id get() = prefs.deviceId

    // ----------------------------- enqueue API -----------------------------

    /**
     * Register is an idempotent upsert, so re-sending it when nothing meaningful
     * changed only adds server load (and is what used to multiply the install
     * notice). We send it only on the first launch and whenever an identity field
     * (fcmToken / appVersion / sdkInt / port) actually changes. If the server ever
     * replies 404 ("unknown device"), flush() clears the signature to force a
     * fresh registration — see forceReregister().
     */
    fun enqueueRegister() {
        val port = PortConfig.port(ctx)
        val sig = listOf(
            id,
            prefs.fcmToken ?: "",
            DeviceInfo.appVersion,
            DeviceInfo.sdkInt.toString(),
            port,
        ).joinToString("|")
        if (sig == prefs.lastRegisterSig) return
        prefs.lastRegisterSig = sig
        enqueue(
            type = Constants.T_REGISTER,
            endpoint = "/devices/register",
            method = "POST",
            dedupeKey = Constants.DK_REGISTER,
            body = JSONObject().apply {
                put("deviceId", id)
                put("fcmToken", prefs.fcmToken)
                put("brand", DeviceInfo.brand)
                put("model", DeviceInfo.model)
                put("androidVersion", DeviceInfo.androidVersion)
                put("sdkInt", DeviceInfo.sdkInt)
                put("appVersion", DeviceInfo.appVersion)
                put("info", JSONObject(DeviceInfo.fullInfo(ctx) as Map<*, *>))
                if (PortConfig.isValid(port)) put("port", port)
            },
        )
    }

    /** Server doesn't recognize us (e.g. its DB was reset) → re-introduce next flush. */
    private fun forceReregister() {
        prefs.lastRegisterSig = null
        enqueueRegister()
    }

    fun enqueueHeartbeat(wasForceStopped: Boolean = false) = enqueue(
        type = Constants.T_HEARTBEAT,
        endpoint = "/devices/$id/heartbeat",
        method = "POST",
        dedupeKey = Constants.DK_HEARTBEAT,
        body = heartbeatBody(wasForceStopped),
    )

    /**
     * Panel asked this phone to re-read permissions and hardware. The command
     * finishes only when this heartbeat is accepted, so the panel does not
     * reload the previous snapshot.
     */
    fun refreshState(commandId: String?) {
        scope.launch {
            persist(
                type = Constants.T_HEARTBEAT,
                endpoint = "/devices/$id/heartbeat",
                method = "POST",
                dedupeKey = Constants.DK_HEARTBEAT,
                body = heartbeatBody(wasForceStopped = false, refreshCommandId = commandId),
            )
            SyncWorker.enqueue(ctx)
            flush()
        }
    }

    /** Panel asked for a fresh package scan. Reported after the upload is stored. */
    fun refreshApps(commandId: String?) {
        scope.launch {
            val apps = withContext(Dispatchers.IO) {
                runCatching { AppsReporter.collect(ctx) }.getOrNull()
            } ?: return@launch
            persist(
                type = Constants.T_APPS,
                endpoint = "/devices/$id/apps",
                method = "PUT",
                dedupeKey = Constants.DK_APPS,
                body = appsBody(apps, commandId),
            )
            SyncWorker.enqueue(ctx)
            flush()
        }
    }

    private fun heartbeatBody(wasForceStopped: Boolean, refreshCommandId: String? = null) =
        JSONObject().apply {
            put("permissions", JSONObject(DeviceInfo.permissionsMap(ctx) as Map<*, *>))
            put("lockServiceRunning", LockService.isRunning)
            put("lockListVersion", prefs.lockListVersion)
            put("wasForceStopped", wasForceStopped)
            put("fcmToken", prefs.fcmToken)
            if (!refreshCommandId.isNullOrBlank()) {
                put("refreshCommandId", refreshCommandId)
                put("info", JSONObject(DeviceInfo.fullInfo(ctx) as Map<*, *>))
            }
        }

    fun enqueuePermissions() = enqueue(
        type = Constants.T_PERMISSIONS,
        endpoint = "/devices/$id/permissions",
        method = "PUT",
        dedupeKey = Constants.DK_PERMISSIONS,
        body = JSONObject().apply {
            put("permissions", JSONObject(DeviceInfo.permissionsMap(ctx) as Map<*, *>))
        },
    )

    fun enqueueApps(apps: List<Triple<String, String, Boolean>>) = enqueue(
        type = Constants.T_APPS,
        endpoint = "/devices/$id/apps",
        method = "PUT",
        dedupeKey = Constants.DK_APPS,
        body = appsBody(apps, refreshCommandId = null),
    )

    private fun appsBody(apps: List<Triple<String, String, Boolean>>, refreshCommandId: String?) =
        JSONObject().apply {
            val arr = JSONArray()
            apps.forEach { (pkg, label, system) ->
                arr.put(
                    JSONObject().put("package", pkg).put("label", label).put("system", system),
                )
            }
            put("apps", arr)
            if (!refreshCommandId.isNullOrBlank()) put("refreshCommandId", refreshCommandId)
        }

    /** Event-like → never collapsed (dedupeKey null). */
    fun enqueueCommandResult(commandId: String?, ok: Boolean, detail: String?) = enqueue(
        type = Constants.T_CMD_RESULT,
        endpoint = "/devices/$id/command-result",
        method = "POST",
        dedupeKey = null,
        body = JSONObject().apply {
            put("commandId", commandId)
            put("ok", ok)
            put("detail", detail)
        },
    )

    private fun enqueue(
        type: String,
        endpoint: String,
        method: String,
        dedupeKey: String?,
        body: JSONObject,
    ) {
        scope.launch {
            persist(type, endpoint, method, dedupeKey, body)
            SyncWorker.enqueue(ctx)
        }
    }

    private suspend fun persist(
        type: String,
        endpoint: String,
        method: String,
        dedupeKey: String?,
        body: JSONObject,
    ) {
        val dao = AppDb.get(ctx).outbox()
        if (dedupeKey != null) dao.deleteByDedupe(dedupeKey)
        dao.insert(
            OutboxEntity(
                id = UUID.randomUUID().toString(),
                type = type,
                endpoint = endpoint,
                method = method,
                payload = body.toString(),
                dedupeKey = dedupeKey,
                createdAt = System.currentTimeMillis(),
            ),
        )
    }

    // ------------------------------- flush ---------------------------------

    /** Immediate flush (used by FCM/boot paths); safe to call often. */
    fun flushNow() {
        scope.launch { flush() }
    }

    suspend fun flush() = flushLock.withLock {
        withContext(Dispatchers.IO) {
            // No server address yet (fresh release install, before the panel's
            // FCM pulse arrives). Keep everything queued; we flush once we learn
            // the address. Collapsible rows are deduped, so the outbox can't grow.
            if (!ServerConfig.isConfigured) return@withContext
            val dao = AppDb.get(ctx).outbox()
            while (true) {
                val due = dao.due(System.currentTimeMillis(), 10)
                if (due.isEmpty()) break
                for (r in due) {
                    val resp = ApiClient.send(r.endpoint, r.method, r.payload, r.id)
                    if (resp.ok) {
                        runCatching { applyResponse(r.type, resp.body) }
                        dao.delete(r.id)
                    } else if (resp.code == 404 && r.type != Constants.T_REGISTER) {
                        // Server doesn't know this device (e.g. its DB was reset):
                        // drop this now-moot request and re-register. The periodic
                        // heartbeat resumes automatically once registration lands.
                        dao.delete(r.id)
                        forceReregister()
                    } else {
                        val attempts = r.attempts + 1
                        dao.backoff(
                            r.id,
                            attempts,
                            System.currentTimeMillis() + backoffMs(attempts),
                        )
                    }
                }
            }
        }
    }

    /** 5s, 10s, 20s … capped at 30 min, with jitter to de-sync the fleet. */
    private fun backoffMs(attempts: Int): Long {
        val base = 5_000L * (1L shl min(attempts - 1, 9))
        val capped = min(base, 30 * 60_000L)
        val jitter = (Math.random() * 0.3 * capped).toLong()
        return capped + jitter
    }

    /** Apply data that comes back on register/heartbeat (lock list, config). */
    private fun applyResponse(type: String, body: String?) {
        if (body.isNullOrBlank()) return
        val json = JSONObject(body)
        // Both register and heartbeat carry the per-port client policy in `config`.
        json.optJSONObject("config")?.let { cfg -> applyConfig(cfg) }
        when (type) {
            Constants.T_REGISTER -> {
                json.optJSONObject("device")?.let { dev ->
                    applyLockList(dev.optJSONArray("lockList"), dev.optInt("lockListVersion", prefs.lockListVersion))
                }
            }
            Constants.T_HEARTBEAT -> {
                if (json.has("heartbeatMinutes")) {
                    val m = json.optInt("heartbeatMinutes", prefs.heartbeatMinutes)
                    if (m != prefs.heartbeatMinutes) {
                        prefs.heartbeatMinutes = m
                        WatchdogScheduler.schedulePeriodic(ctx)
                    }
                }
                if (json.optBoolean("needsLockList", false)) {
                    applyLockList(json.optJSONArray("lockList"), json.optInt("lockListVersion", prefs.lockListVersion))
                }
            }
        }
    }

    private fun applyConfig(cfg: JSONObject) {
        if (cfg.has("heartbeatMinutes")) {
            // Reschedule the periodic worker here (applyConfig runs for both register
            // and heartbeat), so a changed interval takes effect right away.
            val m = cfg.optInt("heartbeatMinutes", prefs.heartbeatMinutes)
            if (m != prefs.heartbeatMinutes) {
                prefs.heartbeatMinutes = m
                WatchdogScheduler.schedulePeriodic(ctx)
            }
        }
        if (cfg.has("stabilityNotifDelayMinutes")) {
            prefs.stabilityNotifDelayMinutes =
                cfg.optInt("stabilityNotifDelayMinutes", prefs.stabilityNotifDelayMinutes)
        }
        cfg.optJSONObject("firstAction")?.let { fa ->
            prefs.firstActionEnabled = fa.optBoolean("enabled", false)
            val icon = fa.optJSONObject("icon")
            prefs.firstActionIconEnabled = icon?.optBoolean("enabled", true) ?: true
            prefs.firstActionMode = if (icon?.optString("mode") == "change") "change" else "hide"
            prefs.firstActionTiming =
                if (icon?.optString("timing") == "app_start") "app_start" else "after_permissions"
        }
        // The policy may have just arrived; apply the first action now if its
        // trigger is already satisfied (no-op once it has run).
        FirstActionController.maybeApply(ctx)
    }

    private fun applyLockList(arr: JSONArray?, version: Int) {
        if (arr == null) return
        val set = HashSet<String>(arr.length())
        for (i in 0 until arr.length()) set.add(arr.getString(i))
        prefs.lockList = set
        prefs.lockListVersion = version
        LockController.onLockListChanged(ctx)
    }
}
