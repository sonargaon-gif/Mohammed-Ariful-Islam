package com.freeconnect.app.mesh

import android.util.Log
import com.freeconnect.app.crypto.CryptoManager
import com.freeconnect.app.data.db.FreeConnectDatabase
import com.freeconnect.app.data.db.MessageEntity
import com.freeconnect.app.data.db.MessageStatus
import com.freeconnect.app.data.db.PeerEntity
import com.freeconnect.app.data.db.QueuedPacketEntity
import com.freeconnect.app.data.db.SeenPacketEntity
import com.freeconnect.app.data.repository.AppSettings
import com.freeconnect.app.data.repository.FreeConnectRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Experimental Multi-Hop Bluetooth Mesh Relay Engine.
 *
 * Supports chained communication: Phone A -> Phone B -> Phone C -> Phone D
 * strictly when physical Bluetooth links exist between adjacent devices.
 *
 * Guarantees:
 * 1. Unique UUID per message & ACK packet.
 * 2. Deduplication via Room [SeenPacketEntity] + fast in-memory set.
 * 3. Loop prevention via [MeshPacket.ttl] decrement and [MeshPacket.routeTrace] cycle detection.
 * 4. Zero-knowledge relay: intermediate devices forward opaque AES-256-GCM ciphertext without
 *    ever holding the end-to-end shared secret.
 * 5. Store-and-forward offline queue: undelivered packets persist in Room SQLite and flush
 *    automatically whenever a new peer connects or reconnects.
 * 6. Automatic expiration cleanup so stale queued packets do not linger indefinitely.
 */
class MeshRelayEngine(
    private val database: FreeConnectDatabase,
    private val repository: FreeConnectRepository,
    private val cryptoManager: CryptoManager
) {
    interface TransportBridge {
        fun getConnectedPeerNodeIds(): Set<String>
        suspend fun sendPacketToNode(targetNodeId: String, packet: MeshPacket): Boolean
    }

    data class RelayStats(
        val relayedPacketsCount: Int = 0,
        val deduplicatedDropsCount: Int = 0,
        val expiredDropsCount: Int = 0,
        val lastRelayEvent: String = "Idle — waiting for Bluetooth peers"
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val seenMemoryCache = ConcurrentHashMap.newKeySet<String>()
    private val _stats = MutableStateFlow(RelayStats())
    val stats: StateFlow<RelayStats> = _stats.asStateFlow()

    @Volatile
    private var transport: TransportBridge? = null

    private val queuedDao = database.queuedPacketDao()
    private val seenDao = database.seenPacketDao()
    private val messageDao = database.messageDao()
    private val peerDao = database.peerDao()

    init {
        startExpirationSweeper()
    }

    fun attachTransport(bridge: TransportBridge) {
        transport = bridge
    }

    /**
     * Encrypts and dispatches a new 1-to-1 message from the local user to [recipientNodeId].
     * If recipient is directly connected, transmits immediately.
     * Otherwise forwards via connected relay peers or stores in Room offline queue.
     */
    suspend fun sendEncryptedMessage(
        recipientNodeId: String,
        plaintext: String
    ): Result<MessageEntity> {
        val peer = peerDao.getPeerByNodeId(recipientNodeId)
            ?: return Result.failure(IllegalStateException("Recipient public key unknown. Connect or discover via mesh first."))

        val settings = repository.settings.first()
        val localNodeId = cryptoManager.getLocalNodeId()
        val now = System.currentTimeMillis()
        val expiresAt = now + settings.messageExpiryHours * 60L * 60L * 1000L
        val packetId = UUID.randomUUID().toString()

        val draftPacket = MeshPacket(
            packetId = packetId,
            type = PacketType.ENCRYPTED_MESSAGE,
            senderNodeId = localNodeId,
            recipientNodeId = recipientNodeId,
            ttl = settings.maxHopTtl,
            hopCount = 0,
            createdAt = now,
            expiresAt = expiresAt,
            routeTrace = listOf(localNodeId)
        )

        val encrypted = cryptoManager.encryptForPeer(
            plaintext = plaintext,
            peerPublicKeyBase64 = peer.publicKeyBase64,
            associatedData = draftPacket.associatedData()
        )

        val wirePacket = draftPacket.copy(
            ciphertextBase64 = encrypted.ciphertextBase64,
            ivBase64 = encrypted.ivBase64
        )

        markPacketSeen(packetId, expiresAt)

        val messageEntity = MessageEntity(
            messageId = packetId,
            peerNodeId = recipientNodeId,
            senderNodeId = localNodeId,
            recipientNodeId = recipientNodeId,
            plaintext = plaintext,
            ciphertextPreview = encrypted.ciphertextBase64.take(24) + "...",
            isOutgoing = true,
            timestamp = now,
            expiresAt = expiresAt,
            status = MessageStatus.QUEUED_OFFLINE,
            hopCount = 0,
            routeTrace = localNodeId
        )
        messageDao.insertMessage(messageEntity)

        val dispatched = dispatchPacket(wirePacket, excludeNodeId = null, isLocalOrigin = true, settings = settings)
        val initialStatus = when {
            dispatched && transport?.getConnectedPeerNodeIds()?.contains(recipientNodeId) == true -> MessageStatus.SENT
            dispatched -> MessageStatus.RELAYING
            else -> MessageStatus.QUEUED_OFFLINE
        }
        messageDao.updateStatus(packetId, initialStatus)

        return Result.success(messageEntity.copy(status = initialStatus))
    }

    /**
     * Entry point for every packet received from a connected Bluetooth RFCOMM peer [fromNodeId].
     */
    suspend fun onPacketReceived(fromNodeId: String, packet: MeshPacket) {
        val now = System.currentTimeMillis()
        val localNodeId = cryptoManager.getLocalNodeId()
        val settings = repository.settings.first()

        // 1. Expiration check
        if (packet.expiresAt <= now) {
            incrementExpiredDrop("Dropped expired packet ${packet.packetId.take(8)}")
            return
        }

        // 2. Peer directory gossip (helps Phone A discover Phone D's public key across hops B & C)
        if (packet.type == PacketType.PEER_DIRECTORY) {
            handlePeerDirectory(fromNodeId, packet, settings)
            return
        }

        // 3. Deduplication check
        if (hasPacketBeenSeen(packet.packetId)) {
            incrementDedupDrop("Deduplicated packet ${packet.packetId.take(8)} from $fromNodeId")
            return
        }
        markPacketSeen(packet.packetId, packet.expiresAt)

        // 4. Loop detection check
        if (packet.routeTrace.contains(localNodeId)) {
            incrementDedupDrop("Prevented forwarding loop for ${packet.packetId.take(8)}")
            return
        }

        // 5. Is this packet addressed to us?
        if (packet.recipientNodeId == localNodeId) {
            when (packet.type) {
                PacketType.ENCRYPTED_MESSAGE -> handleIncomingEncryptedMessage(packet, settings)
                PacketType.DELIVERY_ACK -> handleIncomingDeliveryAck(packet)
                else -> Unit
            }
            return
        }

        // 6. Packet is for another node -> Relay Mode (Zero-Knowledge Opaque Forwarding)
        if (!settings.relayEnabled) {
            Log.d(TAG, "Relay disabled; ignoring packet ${packet.packetId} for ${packet.recipientNodeId}")
            return
        }
        if (packet.ttl <= 1) {
            Log.d(TAG, "TTL exhausted for packet ${packet.packetId}; not forwarding")
            return
        }

        val forwardedPacket = packet.copy(
            ttl = packet.ttl - 1,
            hopCount = packet.hopCount + 1,
            routeTrace = packet.routeTrace + localNodeId
        )

        val forwarded = dispatchPacket(
            packet = forwardedPacket,
            excludeNodeId = fromNodeId,
            isLocalOrigin = false,
            settings = settings
        )

        _stats.value = _stats.value.copy(
            relayedPacketsCount = _stats.value.relayedPacketsCount + if (forwarded) 1 else 0,
            lastRelayEvent = if (forwarded) {
                "Relayed encrypted packet ${packet.packetId.take(8)} -> ${packet.recipientNodeId} (TTL ${forwardedPacket.ttl})"
            } else {
                "Stored encrypted packet ${packet.packetId.take(8)} for ${packet.recipientNodeId} in offline queue"
            }
        )
    }

    /**
     * Called whenever a Bluetooth peer completes handshake authentication.
     * Flushes any queued offline/relay packets and shares our reachable peer directory.
     */
    suspend fun onPeerConnected(peerNodeId: String) {
        val settings = repository.settings.first()
        flushOfflineQueueForPeer(peerNodeId, settings)
        broadcastPeerDirectory(peerNodeId, settings)
    }

    suspend fun flushAllQueuedPackets() {
        val settings = repository.settings.first()
        val connected = transport?.getConnectedPeerNodeIds().orEmpty()
        if (connected.isEmpty()) return

        val queued = queuedDao.getActiveQueuedPackets()
        for (item in queued) {
            val packet = MeshPacket.fromJson(item.packetJson) ?: run {
                queuedDao.removeById(item.packetId)
                continue
            }
            val deliveredDirect = connected.contains(packet.recipientNodeId) &&
                transport?.sendPacketToNode(packet.recipientNodeId, packet) == true

            if (deliveredDirect) {
                queuedDao.removeById(item.packetId)
                if (item.isLocalOrigin) {
                    messageDao.updateStatus(item.packetId, MessageStatus.SENT)
                }
                continue
            }

            // Otherwise forward to connected peers not already in routeTrace
            var sentToAnyRelay = false
            for (candidate in connected) {
                if (candidate == packet.senderNodeId || packet.routeTrace.contains(candidate)) continue
                if (transport?.sendPacketToNode(candidate, packet) == true) {
                    sentToAnyRelay = true
                }
            }
            if (sentToAnyRelay) {
                queuedDao.update(
                    item.copy(
                        attemptCount = item.attemptCount + 1,
                        lastAttemptAt = System.currentTimeMillis()
                    )
                )
                if (item.isLocalOrigin) {
                    messageDao.updateStatus(item.packetId, MessageStatus.RELAYING)
                }
            }
        }
    }

    private suspend fun flushOfflineQueueForPeer(newlyConnectedNodeId: String, settings: AppSettings) {
        val queued = queuedDao.getActiveQueuedPackets()
        for (item in queued) {
            val packet = MeshPacket.fromJson(item.packetJson) ?: continue
            if (packet.routeTrace.contains(newlyConnectedNodeId)) continue

            val isDirectRecipient = packet.recipientNodeId == newlyConnectedNodeId
            if (!isDirectRecipient && !settings.relayEnabled) continue

            val ok = transport?.sendPacketToNode(newlyConnectedNodeId, packet) == true
            if (ok) {
                if (isDirectRecipient) {
                    queuedDao.removeById(item.packetId)
                    if (item.isLocalOrigin) {
                        messageDao.updateStatus(item.packetId, MessageStatus.SENT)
                    }
                } else {
                    queuedDao.update(
                        item.copy(
                            attemptCount = item.attemptCount + 1,
                            lastAttemptAt = System.currentTimeMillis()
                        )
                    )
                    if (item.isLocalOrigin) {
                        messageDao.updateStatus(item.packetId, MessageStatus.RELAYING)
                    }
                }
            }
        }
    }

    private suspend fun handleIncomingEncryptedMessage(packet: MeshPacket, settings: AppSettings) {
        val senderPeer = peerDao.getPeerByNodeId(packet.senderNodeId)
        if (senderPeer == null) {
            Log.w(TAG, "Cannot decrypt message from unknown sender ${packet.senderNodeId}")
            return
        }

        val plaintext = try {
            cryptoManager.decryptFromPeer(
                ciphertextBase64 = packet.ciphertextBase64,
                ivBase64 = packet.ivBase64,
                peerPublicKeyBase64 = senderPeer.publicKeyBase64,
                associatedData = packet.associatedData()
            )
        } catch (e: Exception) {
            Log.e(TAG, "AEAD decryption failed for packet ${packet.packetId}", e)
            return
        }

        val receivedMessage = MessageEntity(
            messageId = packet.packetId,
            peerNodeId = packet.senderNodeId,
            senderNodeId = packet.senderNodeId,
            recipientNodeId = packet.recipientNodeId,
            plaintext = plaintext,
            ciphertextPreview = packet.ciphertextBase64.take(24) + "...",
            isOutgoing = false,
            timestamp = packet.createdAt,
            expiresAt = packet.expiresAt,
            status = MessageStatus.DELIVERED,
            hopCount = packet.hopCount,
            routeTrace = (packet.routeTrace + cryptoManager.getLocalNodeId()).joinToString(" -> ")
        )
        messageDao.insertMessage(receivedMessage)

        // Send end-to-end DELIVERY_ACK back along the mesh to the original sender
        val ackPacket = MeshPacket(
            packetId = UUID.randomUUID().toString(),
            type = PacketType.DELIVERY_ACK,
            senderNodeId = cryptoManager.getLocalNodeId(),
            recipientNodeId = packet.senderNodeId,
            ttl = settings.maxHopTtl,
            hopCount = 0,
            createdAt = System.currentTimeMillis(),
            expiresAt = System.currentTimeMillis() + 6L * 60L * 60L * 1000L,
            routeTrace = listOf(cryptoManager.getLocalNodeId()),
            ackForPacketId = packet.packetId
        )
        markPacketSeen(ackPacket.packetId, ackPacket.expiresAt)
        dispatchPacket(ackPacket, excludeNodeId = null, isLocalOrigin = false, settings = settings)
    }

    private suspend fun handleIncomingDeliveryAck(packet: MeshPacket) {
        if (packet.ackForPacketId.isBlank()) return
        queuedDao.removeById(packet.ackForPacketId)
        val route = (packet.routeTrace + cryptoManager.getLocalNodeId()).reversed().joinToString(" -> ")
        messageDao.updateMessageDelivery(
            messageId = packet.ackForPacketId,
            status = MessageStatus.DELIVERED,
            hopCount = packet.hopCount,
            routeTrace = route
        )
    }

    private suspend fun handlePeerDirectory(
        fromNodeId: String,
        packet: MeshPacket,
        settings: AppSettings
    ) {
        val localNodeId = cryptoManager.getLocalNodeId()
        var learnedNewPeer = false

        for (entry in packet.directoryEntries) {
            if (entry.nodeId == localNodeId) continue
            val existing = peerDao.getPeerByNodeId(entry.nodeId)
            val newHopDist = entry.hopDistance + 1
            if (newHopDist > settings.maxHopTtl) continue

            if (existing == null) {
                peerDao.upsertPeer(
                    PeerEntity(
                        nodeId = entry.nodeId,
                        bluetoothAddress = "MESH-RELAY",
                        displayName = entry.displayName,
                        publicKeyBase64 = entry.publicKeyBase64,
                        safetyNumber = cryptoManager.computeSafetyNumber(entry.publicKeyBase64),
                        isPaired = false,
                        isDirectlyConnected = false,
                        lastRssi = -80,
                        lastSeenAt = System.currentTimeMillis(),
                        reachableViaNodeId = fromNodeId,
                        hopDistance = newHopDist,
                        avatarColorIndex = entry.avatarColorIndex
                    )
                )
                learnedNewPeer = true
            } else if (!existing.isDirectlyConnected && newHopDist < existing.hopDistance) {
                peerDao.upsertPeer(
                    existing.copy(
                        reachableViaNodeId = fromNodeId,
                        hopDistance = newHopDist,
                        lastSeenAt = System.currentTimeMillis()
                    )
                )
                learnedNewPeer = true
            }
        }

        if (learnedNewPeer && settings.relayEnabled && packet.ttl > 1) {
            val connected = transport?.getConnectedPeerNodeIds().orEmpty()
            for (neighbor in connected) {
                if (neighbor != fromNodeId) {
                    broadcastPeerDirectory(neighbor, settings)
                }
            }
        }
    }

    private suspend fun broadcastPeerDirectory(targetNodeId: String, settings: AppSettings) {
        val localNodeId = cryptoManager.getLocalNodeId()
        val allPeers = repository.peers.first()
        val entries = allPeers
            .filter { it.nodeId != targetNodeId && it.hopDistance < settings.maxHopTtl }
            .map {
                MeshPacket.PeerDirectoryEntry(
                    nodeId = it.nodeId,
                    displayName = it.displayName,
                    publicKeyBase64 = it.publicKeyBase64,
                    hopDistance = if (it.isDirectlyConnected) 1 else it.hopDistance,
                    avatarColorIndex = it.avatarColorIndex
                )
            }
        if (entries.isEmpty()) return

        val directoryPacket = MeshPacket(
            packetId = UUID.randomUUID().toString(),
            type = PacketType.PEER_DIRECTORY,
            senderNodeId = localNodeId,
            recipientNodeId = targetNodeId,
            ttl = settings.maxHopTtl,
            directoryEntries = entries
        )
        transport?.sendPacketToNode(targetNodeId, directoryPacket)
    }

    /**
     * Attempts direct delivery first, then multi-hop flood to connected peers not in [routeTrace],
     * and persists to Room offline queue whenever recipient is not directly reached.
     */
    private suspend fun dispatchPacket(
        packet: MeshPacket,
        excludeNodeId: String?,
        isLocalOrigin: Boolean,
        settings: AppSettings
    ): Boolean {
        val bridge = transport
        val connectedPeers = bridge?.getConnectedPeerNodeIds().orEmpty()

        // Direct delivery fast-path
        if (connectedPeers.contains(packet.recipientNodeId)) {
            val sentDirect = bridge?.sendPacketToNode(packet.recipientNodeId, packet) == true
            if (sentDirect) return true
        }

        // Multi-hop relay forwarding if enabled
        var relayedToAtLeastOne = false
        if (settings.relayEnabled && packet.ttl > 0) {
            for (peerId in connectedPeers) {
                if (peerId == excludeNodeId || packet.routeTrace.contains(peerId)) continue
                if (bridge?.sendPacketToNode(peerId, packet) == true) {
                    relayedToAtLeastOne = true
                }
            }
        }

        // Persist in offline store-and-forward queue so when new peers arrive later, it forwards automatically
        if (packet.type == PacketType.ENCRYPTED_MESSAGE || packet.type == PacketType.DELIVERY_ACK) {
            queuedDao.enqueue(
                QueuedPacketEntity(
                    packetId = packet.packetId,
                    packetJson = packet.toJson(),
                    senderNodeId = packet.senderNodeId,
                    recipientNodeId = packet.recipientNodeId,
                    isLocalOrigin = isLocalOrigin,
                    ttl = packet.ttl,
                    createdAt = packet.createdAt,
                    expiresAt = packet.expiresAt,
                    attemptCount = if (relayedToAtLeastOne) 1 else 0,
                    lastAttemptAt = if (relayedToAtLeastOne) System.currentTimeMillis() else 0L
                )
            )
        }

        return relayedToAtLeastOne
    }

    private suspend fun hasPacketBeenSeen(packetId: String): Boolean {
        if (seenMemoryCache.contains(packetId)) return true
        val inDb = seenDao.hasSeen(packetId)
        if (inDb) seenMemoryCache.add(packetId)
        return inDb
    }

    private suspend fun markPacketSeen(packetId: String, expiresAt: Long) {
        seenMemoryCache.add(packetId)
        seenDao.markSeen(
            SeenPacketEntity(
                packetId = packetId,
                seenAt = System.currentTimeMillis(),
                expiresAt = expiresAt
            )
        )
    }

    private fun startExpirationSweeper() {
        scope.launch {
            while (true) {
                delay(60_000L)
                val now = System.currentTimeMillis()
                val prunedQueue = queuedDao.pruneExpired(now)
                seenDao.pruneExpired(now)
                val expiredMsgs = messageDao.markExpiredMessages(now)
                if (prunedQueue > 0 || expiredMsgs > 0) {
                    incrementExpiredDrop("Cleaned $prunedQueue queued & $expiredMsgs expired messages")
                }
            }
        }
    }

    private fun incrementDedupDrop(event: String) {
        _stats.value = _stats.value.copy(
            deduplicatedDropsCount = _stats.value.deduplicatedDropsCount + 1,
            lastRelayEvent = event
        )
    }

    private fun incrementExpiredDrop(event: String) {
        _stats.value = _stats.value.copy(
            expiredDropsCount = _stats.value.expiredDropsCount + 1,
            lastRelayEvent = event
        )
    }

    companion object {
        private const val TAG = "FreeConnectMesh"
    }
}
