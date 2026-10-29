package com.company.applock.sync.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface OutboxDao {
    @Query("SELECT * FROM outbox WHERE nextAttemptAt <= :now ORDER BY createdAt ASC LIMIT :limit")
    suspend fun due(now: Long, limit: Int): List<OutboxEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(e: OutboxEntity)

    @Query("DELETE FROM outbox WHERE id = :id")
    suspend fun delete(id: String)

    /** Collapse: drop any pending row in the same last-writer-wins group. */
    @Query("DELETE FROM outbox WHERE dedupeKey = :key")
    suspend fun deleteByDedupe(key: String)

    @Query("UPDATE outbox SET attempts = :attempts, nextAttemptAt = :nextAt WHERE id = :id")
    suspend fun backoff(id: String, attempts: Int, nextAt: Long)

    @Query("SELECT COUNT(*) FROM outbox")
    suspend fun count(): Int
}
