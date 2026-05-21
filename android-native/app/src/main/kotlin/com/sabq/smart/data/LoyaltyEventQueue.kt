package com.sabq.smart.data

import android.content.Context
import android.util.Log
import com.sabq.smart.data.api.LoyaltyEventBatchRequest
import com.sabq.smart.data.api.LoyaltyEventDto
import com.sabq.smart.data.api.SabqApi
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

/**
 * On-device batching queue for loyalty events. Mirrors iOS
 * `LoyaltyEventQueue` (`Services/LoyaltyEventQueue.swift`) 1:1.
 *
 * - Persists pending events as JSON in [filesDir]/sabq-loyalty-queue.json
 *   so they survive process death + force-quits.
 * - Flushes every 30 s on a timer, when the queue grows past 50, and
 *   on app background (via [com.sabq.smart.SabqApplication] hooking
 *   `ProcessLifecycleOwner`).
 * - Failures keep the batch on disk and retry on the next flush with
 *   exponential backoff (1 s, 2 s, 4 s, …, capped at 30 s). Server
 *   applies daily caps + dedup so retries don't produce duplicates.
 *
 * Thread-safety: all mutation goes through [mutex]. Public [enqueue]
 * variants are non-suspend so reader-side call sites
 * (BehaviorTracker, like/share toggles, etc.) can fire-and-forget
 * from any thread — the actual list-add + disk-write happens on
 * [scope]'s IO dispatcher.
 */
@Singleton
class LoyaltyEventQueue @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: SabqApi,
) {
    @Serializable
    private data class Persisted(val events: List<LoyaltyEventPayload> = emptyList())

    private val mutex = Mutex()
    private val pending = mutableListOf<LoyaltyEventPayload>()
    private var consecutiveFailures = 0
    private var loaded = false
    private var flushLoop: Job? = null

    /** Application-scope coroutine. Wired from [com.sabq.smart.SabqApplication.onCreate]. */
    private var scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private val storageFile: File
        get() = File(context.filesDir, FILE_NAME)

    /**
     * Wire up the application-scoped queue. Idempotent — calling
     * twice doesn't restart the flush loop. Called once from
     * `SabqApplication.onCreate`.
     */
    fun start(applicationScope: CoroutineScope) {
        scope = applicationScope
        ensureLoaded()
        startFlushLoopIfNeeded()
    }

    /** Convenience overload — most call sites only need this. */
    fun enqueue(action: LoyaltyAction, articleId: String? = null, duration: Int? = null) {
        val source = articleId?.let { "article:$it" }
        enqueue(
            LoyaltyEventPayload(
                action = action.value,
                source = source,
                articleId = articleId,
                duration = duration,
            ),
        )
    }

    /** Public entry — call from anywhere (BehaviorTracker, like toggle, etc.). */
    fun enqueue(event: LoyaltyEventPayload) {
        scope.launch {
            ensureLoaded()
            val shouldFlush = mutex.withLock {
                pending.add(event)
                pending.size >= MAX_QUEUE_BEFORE_FLUSH
            }
            saveToDisk()
            startFlushLoopIfNeeded()
            if (shouldFlush) flush()
        }
    }

    /** Public manual flush trigger — used by the app-background hook. */
    suspend fun flushNow() {
        ensureLoaded()
        flush()
    }

    // -- internals --------------------------------------------------

    private fun ensureLoaded() {
        if (loaded) return
        synchronized(this) {
            if (loaded) return
            val file = storageFile
            if (file.exists()) {
                runCatching { json.decodeFromString(Persisted.serializer(), file.readText()) }
                    .onSuccess { decoded ->
                        if (decoded.events.isNotEmpty()) {
                            pending.addAll(decoded.events)
                            Log.d(TAG, "Restored ${decoded.events.size} pending events from disk")
                        }
                    }
                    .onFailure {
                        Log.w(TAG, "Corrupt loyalty queue file, starting empty", it)
                        runCatching { file.delete() }
                    }
            }
            loaded = true
        }
    }

    private fun startFlushLoopIfNeeded() {
        val current = flushLoop
        if (current != null && current.isActive) return
        flushLoop = scope.launch {
            while (isActive) {
                delay(FLUSH_INTERVAL_MS)
                flush()
            }
        }
    }

    private suspend fun flush() {
        val batch = mutex.withLock {
            if (pending.isEmpty()) return
            pending.take(MAX_QUEUE_BEFORE_FLUSH).toList()
        }

        val dtos = batch.map {
            LoyaltyEventDto(
                action = it.action,
                source = it.source,
                articleId = it.articleId,
                duration = it.duration,
                extraInfo = it.extraInfo,
            )
        }

        val result = runCatching {
            api.submitLoyaltyEvents(LoyaltyEventBatchRequest(events = dtos))
        }

        result.onSuccess { response ->
            mutex.withLock {
                // Drop the flushed slice. Use size-aware removal in
                // case the list grew while the request was in flight.
                val drop = minOf(batch.size, pending.size)
                repeat(drop) { pending.removeAt(0) }
                consecutiveFailures = 0
            }
            saveToDisk()
            val awarded = response.results.count { it.outcome == "AWARDED" }
            Log.i(TAG, "Flushed ${batch.size} events, ${awarded} awarded points")
        }

        result.onFailure { e ->
            mutex.withLock { consecutiveFailures += 1 }
            val backoffMs = minOf(
                MAX_BACKOFF_MS,
                (1_000L shl (consecutiveFailures - 1).coerceAtMost(5)),
            )
            Log.w(TAG, "Flush failed (attempt $consecutiveFailures), retrying in ${backoffMs}ms", e)
            delay(backoffMs)
        }
    }

    private suspend fun saveToDisk() {
        val snapshot = mutex.withLock { Persisted(events = pending.toList()) }
        withContext(Dispatchers.IO) {
            runCatching {
                val tmp = File(context.filesDir, "$FILE_NAME.tmp")
                tmp.writeText(json.encodeToString(Persisted.serializer(), snapshot))
                tmp.renameTo(storageFile)
            }.onFailure { Log.w(TAG, "saveToDisk failed", it) }
        }
    }

    companion object {
        private const val TAG = "LoyaltyEventQueue"
        private const val FILE_NAME = "sabq-loyalty-queue.json"
        private const val FLUSH_INTERVAL_MS = 30_000L
        private const val MAX_QUEUE_BEFORE_FLUSH = 50
        private const val MAX_BACKOFF_MS = 30_000L
    }
}
