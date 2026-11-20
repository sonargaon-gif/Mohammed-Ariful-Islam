package com.freeconnect.app.mesh

import com.freeconnect.app.crypto.CryptoManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

/**
 * Offline Bluetooth Emergency SOS Broadcast & Multi-Hop Relay Manager.
 *
 * IMPORTANT HONESTY NOTICE:
 * Emergency broadcasts travel strictly over connected Bluetooth Classic / BLE links
 * and participating FreeConnect relay phones. They CANNOT reach devices outside the
 * active physical Bluetooth relay chain (no cellular / satellite / internet fallback).
 */
class EmergencySosManager(
    private val cryptoManager: CryptoManager
) {
    data class SosBroadcastRecord(
        val sosId: String,
        val senderNodeId: String,
        val senderName: String,
        val message: String,
        val timestamp: Long,
        val hopsTraversed: Int,
        val reachedPeerCount: Int
    )

    private val _sosHistory = MutableStateFlow<List<SosBroadcastRecord>>(emptyList())
    val sosHistory: StateFlow<List<SosBroadcastRecord>> = _sosHistory.asStateFlow()

    suspend fun broadcastPrioritySos(
        senderDisplayName: String,
        emergencyText: String,
        maxHops: Int,
        transport: MeshRelayEngine.TransportBridge
    ): SosBroadcastRecord {
        val sosId = "SOS-" + UUID.randomUUID().toString().take(8).uppercase()
        val now = System.currentTimeMillis()
        val connectedPeers = transport.getConnectedPeerNodeIds()

        val sosPacket = MeshPacket(
            packetId = sosId,
            type = PacketType.ENCRYPTED_MESSAGE,
            senderNodeId = cryptoManager.getLocalNodeId(),
            recipientNodeId = "SOS_BROADCAST",
            ttl = maxHops.coerceIn(2, 6),
            hopCount = 0,
            createdAt = now,
            expiresAt = now + 12L * 60L * 60L * 1000L,
            routeTrace = listOf(cryptoManager.getLocalNodeId()),
            senderDisplayName = senderDisplayName,
            ciphertextBase64 = "[PRIORITY_SOS] $emergencyText"
        )

        var deliveredDirectCount = 0
        for (peerId in connectedPeers) {
            if (transport.sendPacketToNode(peerId, sosPacket)) {
                deliveredDirectCount++
            }
        }

        val record = SosBroadcastRecord(
            sosId = sosId,
            senderNodeId = cryptoManager.getLocalNodeId(),
            senderName = senderDisplayName,
            message = emergencyText,
            timestamp = now,
            hopsTraversed = 0,
            reachedPeerCount = deliveredDirectCount
        )
        _sosHistory.value = listOf(record) + _sosHistory.value
        return record
    }
}
