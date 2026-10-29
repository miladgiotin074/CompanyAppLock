package com.company.applock.sync.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [OutboxEntity::class], version = 1, exportSchema = false)
abstract class AppDb : RoomDatabase() {
    abstract fun outbox(): OutboxDao

    companion object {
        @Volatile
        private var instance: AppDb? = null

        fun get(ctx: Context): AppDb =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    ctx.applicationContext,
                    AppDb::class.java,
                    "applock.db",
                ).fallbackToDestructiveMigration().build().also { instance = it }
            }
    }
}
