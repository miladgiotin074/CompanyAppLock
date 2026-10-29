package com.company.applock.sync.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * One pending outbound request. `id` is a client-generated UUID that doubles as
 * the Idempotency-Key, so an at-least-once retry is applied effectively-once by
 * the server. `dedupeKey` groups collapsible, last-writer-wins messages
 * (heartbeat/permissions/apps/register); event-like messages leave it null.
 */
@Entity(tableName = "outbox")
data class OutboxEntity(
    @PrimaryKey val id: String,
    val type: String,
    val endpoint: String,
    val method: String,
    val payload: String,
    val dedupeKey: String?,
    val createdAt: Long,
    val attempts: Int = 0,
    val nextAttemptAt: Long = 0L,
)
