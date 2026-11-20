package com.freeconnect.app.data.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

enum class MessageStatus {
    QUEUED_OFFLINE,   // Stored locally; waiting for peer or relay link
    RELAYING,         // Forwarded to an intermediate peer hop
    SENT,             // Transmitted over RFCOMM socket to direct peer
    DELIVERED,        // End-to-end cryptographic DELIVERY_ACK received from recipient
    EXPIRED,          // Reached expiration time before delivery
    FAILED            // Unrecoverable error
}

enum class ConnectionState {
    DISCONNECTED,
    PAIRING,
    CONNECTING,
    AUTHENTICATING,
    CONNECTED
}

@Entity(tableName = "local_profile")
data class LocalProfileEntity(
    @PrimaryKey val id: Int = 1,
    val nodeId: String,
    val displayName: String,
    val avatarColorIndex: Int = 0,
    val avatarUri: String? = null,
    val statusNote: String = "Available over Bluetooth",
    val onboardingCompleted: Boolean = false
)

@Entity(tableName = "peers")
data class PeerEntity(
    @PrimaryKey val nodeId: String,
    val bluetoothAddress: String,
    val displayName: String,
    val publicKeyBase64: String,
    val safetyNumber: String,
    val isPaired: Boolean = false,
    val isDirectlyConnected: Boolean = false,
    val lastRssi: Int = -70,
    val lastSeenAt: Long = System.currentTimeMillis(),
    val reachableViaNodeId: String? = null,
    val hopDistance: Int = 1,
    val avatarColorIndex: Int = 1
)

@Entity(
    tableName = "messages",
    indices = [
        Index(value = ["peerNodeId"]),
        Index(value = ["timestamp"]),
        Index(value = ["status"])
    ]
)
data class MessageEntity(
    @PrimaryKey val messageId: String,
    val peerNodeId: String,
    val senderNodeId: String,
    val recipientNodeId: String,
    val plaintext: String,
    val ciphertextPreview: String,
    val isOutgoing: Boolean,
    val timestamp: Long,
    val expiresAt: Long,
    val status: MessageStatus,
    val hopCount: Int = 0,
    val routeTrace: String = ""
)

/**
 * Store-and-forward queue holding encrypted packets awaiting transmission or multi-hop relay.
 * Intermediate phones only store opaque encrypted bytes — never plaintext.
 */
@Entity(
    tableName = "queued_packets",
    indices = [Index(value = ["recipientNodeId"]), Index(value = ["expiresAt"])]
)
data class QueuedPacketEntity(
    @PrimaryKey val packetId: String,
    val packetJson: String,
    val senderNodeId: String,
    val recipientNodeId: String,
    val isLocalOrigin: Boolean,
    val ttl: Int,
    val createdAt: Long,
    val expiresAt: Long,
    val attemptCount: Int = 0,
    val lastAttemptAt: Long = 0L
)

/**
 * Deduplication cache preventing infinite forwarding loops and duplicate message inserts.
 */
@Entity(
    tableName = "seen_packets",
    indices = [Index(value = ["expiresAt"])]
)
data class SeenPacketEntity(
    @PrimaryKey val packetId: String,
    val seenAt: Long,
    val expiresAt: Long
)
