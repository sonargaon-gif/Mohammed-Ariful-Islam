package com.freeconnect.app.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverter
import androidx.room.TypeConverters

class FreeConnectConverters {
    @TypeConverter
    fun fromMessageStatus(status: MessageStatus): String = status.name

    @TypeConverter
    fun toMessageStatus(value: String): MessageStatus =
        runCatching { MessageStatus.valueOf(value) }.getOrDefault(MessageStatus.QUEUED_OFFLINE)
}

@Database(
    entities = [
        LocalProfileEntity::class,
        PeerEntity::class,
        MessageEntity::class,
        QueuedPacketEntity::class,
        SeenPacketEntity::class
    ],
    version = 1,
    exportSchema = false
)
@TypeConverters(FreeConnectConverters::class)
abstract class FreeConnectDatabase : RoomDatabase() {
    abstract fun localProfileDao(): LocalProfileDao
    abstract fun peerDao(): PeerDao
    abstract fun messageDao(): MessageDao
    abstract fun queuedPacketDao(): QueuedPacketDao
    abstract fun seenPacketDao(): SeenPacketDao

    companion object {
        @Volatile
        private var INSTANCE: FreeConnectDatabase? = null

        fun getInstance(context: Context): FreeConnectDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    FreeConnectDatabase::class.java,
                    "freeconnect_offline.db"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}
