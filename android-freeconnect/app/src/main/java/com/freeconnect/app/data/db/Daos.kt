package com.freeconnect.app.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface LocalProfileDao {
    @Query("SELECT * FROM local_profile WHERE id = 1")
    fun observeProfile(): Flow<LocalProfileEntity?>

    @Query("SELECT * FROM local_profile WHERE id = 1")
    suspend fun getProfile(): LocalProfileEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertProfile(profile: LocalProfileEntity)
}

@Dao
interface PeerDao {
    @Query("SELECT * FROM peers ORDER BY isDirectlyConnected DESC, lastSeenAt DESC")
    fun observeAllPeers(): Flow<List<PeerEntity>>

    @Query("SELECT * FROM peers WHERE nodeId = :nodeId LIMIT 1")
    suspend fun getPeerByNodeId(nodeId: String): PeerEntity?

    @Query("SELECT * FROM peers WHERE bluetoothAddress = :address LIMIT 1")
    suspend fun getPeerByAddress(address: String): PeerEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertPeer(peer: PeerEntity)

    @Query("UPDATE peers SET isDirectlyConnected = :connected, lastSeenAt = :timestamp WHERE nodeId = :nodeId")
    suspend fun updateConnectionStatus(nodeId: String, connected: Boolean, timestamp: Long = System.currentTimeMillis())

    @Query("UPDATE peers SET isDirectlyConnected = 0")
    suspend fun markAllDisconnected()

    @Query("DELETE FROM peers")
    suspend fun deleteAllPeers()
}

@Dao
interface MessageDao {
    @Query("SELECT * FROM messages WHERE peerNodeId = :peerNodeId ORDER BY timestamp ASC")
    fun observeConversation(peerNodeId: String): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages ORDER BY timestamp DESC")
    fun observeAllMessages(): Flow<List<MessageEntity>>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertMessage(message: MessageEntity): Long

    @Query("UPDATE messages SET status = :status, hopCount = :hopCount, routeTrace = :routeTrace WHERE messageId = :messageId")
    suspend fun updateMessageDelivery(
        messageId: String,
        status: MessageStatus,
        hopCount: Int,
        routeTrace: String
    )

    @Query("UPDATE messages SET status = :status WHERE messageId = :messageId")
    suspend fun updateStatus(messageId: String, status: MessageStatus)

    @Query("UPDATE messages SET status = 'EXPIRED' WHERE status IN ('QUEUED_OFFLINE', 'RELAYING') AND expiresAt < :now")
    suspend fun markExpiredMessages(now: Long): Int

    @Query("DELETE FROM messages WHERE peerNodeId = :peerNodeId")
    suspend fun deleteConversation(peerNodeId: String)

    @Query("DELETE FROM messages")
    suspend fun deleteAllMessages()
}

@Dao
interface QueuedPacketDao {
    @Query("SELECT * FROM queued_packets WHERE expiresAt > :now ORDER BY createdAt ASC")
    suspend fun getActiveQueuedPackets(now: Long = System.currentTimeMillis()): List<QueuedPacketEntity>

    @Query("SELECT COUNT(*) FROM queued_packets WHERE expiresAt > :now")
    fun observeActiveQueueCount(now: Long = System.currentTimeMillis()): Flow<Int>

    @Query("SELECT * FROM queued_packets ORDER BY createdAt DESC")
    fun observeAllQueuedPackets(): Flow<List<QueuedPacketEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun enqueue(packet: QueuedPacketEntity)

    @Update
    suspend fun update(packet: QueuedPacketEntity)

    @Query("DELETE FROM queued_packets WHERE packetId = :packetId")
    suspend fun removeById(packetId: String)

    @Query("DELETE FROM queued_packets WHERE expiresAt <= :now")
    suspend fun pruneExpired(now: Long = System.currentTimeMillis()): Int

    @Query("DELETE FROM queued_packets")
    suspend fun deleteAll()
}

@Dao
interface SeenPacketDao {
    @Query("SELECT EXISTS(SELECT 1 FROM seen_packets WHERE packetId = :packetId)")
    suspend fun hasSeen(packetId: String): Boolean

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun markSeen(packet: SeenPacketEntity)

    @Query("SELECT COUNT(*) FROM seen_packets")
    fun observeSeenCount(): Flow<Int>

    @Query("DELETE FROM seen_packets WHERE expiresAt <= :now")
    suspend fun pruneExpired(now: Long = System.currentTimeMillis()): Int

    @Query("DELETE FROM seen_packets")
    suspend fun deleteAll()
}
