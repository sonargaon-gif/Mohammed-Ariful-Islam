package com.freeconnect.app.mesh

import org.json.JSONArray
import org.json.JSONObject

enum class PacketType {
    HANDSHAKE,
    HANDSHAKE_ACK,
    ENCRYPTED_MESSAGE,
    DELIVERY_ACK,
    PEER_DIRECTORY,
    HEARTBEAT
}

/**
 * Wire-level packet exchanged over Bluetooth Classic RFCOMM sockets.
 *
 * Privacy property:
 * When [type] == [PacketType.ENCRYPTED_MESSAGE], [ciphertextBase64] and [ivBase64]
 * are AES-256-GCM encrypted using the ECDH shared secret of [senderNodeId] and [recipientNodeId].
 * Intermediate relay nodes inspect ONLY routing headers ([packetId], [recipientNodeId], [ttl],
 * [hopCount], [routeTrace], [expiresAt]) and forward the opaque ciphertext untouched.
 */
data class MeshPacket(
    val packetId: String,
    val type: PacketType,
    val senderNodeId: String,
    val recipientNodeId: String,
    val ttl: Int,
    val hopCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    val expiresAt: Long = createdAt + 24 * 60 * 60 * 1000L,
    val routeTrace: List<String> = emptyList(),
    // Handshake / Auth fields
    val senderDisplayName: String = "",
    val senderPublicKeyBase64: String = "",
    val nonceBase64: String = "",
    val signatureBase64: String = "",
    val avatarColorIndex: Int = 0,
    // End-to-End Encrypted Message fields (opaque to relay nodes)
    val ciphertextBase64: String = "",
    val ivBase64: String = "",
    // Delivery ACK target message ID
    val ackForPacketId: String = "",
    // Known reachable peers advertised across the mesh (nodeId + publicKey + displayName + hopDistance)
    val directoryEntries: List<PeerDirectoryEntry> = emptyList()
) {
    data class PeerDirectoryEntry(
        val nodeId: String,
        val displayName: String,
        val publicKeyBase64: String,
        val hopDistance: Int,
        val avatarColorIndex: Int
    )

    fun toJson(): String {
        val obj = JSONObject().apply {
            put("packetId", packetId)
            put("type", type.name)
            put("senderNodeId", senderNodeId)
            put("recipientNodeId", recipientNodeId)
            put("ttl", ttl)
            put("hopCount", hopCount)
            put("createdAt", createdAt)
            put("expiresAt", expiresAt)
            put("routeTrace", JSONArray(routeTrace))
            put("senderDisplayName", senderDisplayName)
            put("senderPublicKeyBase64", senderPublicKeyBase64)
            put("nonceBase64", nonceBase64)
            put("signatureBase64", signatureBase64)
            put("avatarColorIndex", avatarColorIndex)
            put("ciphertextBase64", ciphertextBase64)
            put("ivBase64", ivBase64)
            put("ackForPacketId", ackForPacketId)

            val dirArray = JSONArray()
            directoryEntries.forEach { entry ->
                dirArray.put(JSONObject().apply {
                    put("nodeId", entry.nodeId)
                    put("displayName", entry.displayName)
                    put("publicKeyBase64", entry.publicKeyBase64)
                    put("hopDistance", entry.hopDistance)
                    put("avatarColorIndex", entry.avatarColorIndex)
                })
            }
            put("directoryEntries", dirArray)
        }
        return obj.toString()
    }

    fun associatedData(): String = "$packetId|$senderNodeId|$recipientNodeId|$createdAt"

    companion object {
        fun fromJson(raw: String): MeshPacket? {
            return try {
                val obj = JSONObject(raw)
                val traceJson = obj.optJSONArray("routeTrace") ?: JSONArray()
                val trace = buildList {
                    for (i in 0 until traceJson.length()) {
                        add(traceJson.getString(i))
                    }
                }
                val dirJson = obj.optJSONArray("directoryEntries") ?: JSONArray()
                val directory = buildList {
                    for (i in 0 until dirJson.length()) {
                        val item = dirJson.getJSONObject(i)
                        add(
                            PeerDirectoryEntry(
                                nodeId = item.getString("nodeId"),
                                displayName = item.getString("displayName"),
                                publicKeyBase64 = item.getString("publicKeyBase64"),
                                hopDistance = item.optInt("hopDistance", 1),
                                avatarColorIndex = item.optInt("avatarColorIndex", 0)
                            )
                        )
                    }
                }

                MeshPacket(
                    packetId = obj.getString("packetId"),
                    type = PacketType.valueOf(obj.getString("type")),
                    senderNodeId = obj.getString("senderNodeId"),
                    recipientNodeId = obj.getString("recipientNodeId"),
                    ttl = obj.optInt("ttl", 3),
                    hopCount = obj.optInt("hopCount", 0),
                    createdAt = obj.optLong("createdAt", System.currentTimeMillis()),
                    expiresAt = obj.optLong("expiresAt", System.currentTimeMillis() + 86_400_000L),
                    routeTrace = trace,
                    senderDisplayName = obj.optString("senderDisplayName", ""),
                    senderPublicKeyBase64 = obj.optString("senderPublicKeyBase64", ""),
                    nonceBase64 = obj.optString("nonceBase64", ""),
                    signatureBase64 = obj.optString("signatureBase64", ""),
                    avatarColorIndex = obj.optInt("avatarColorIndex", 0),
                    ciphertextBase64 = obj.optString("ciphertextBase64", ""),
                    ivBase64 = obj.optString("ivBase64", ""),
                    ackForPacketId = obj.optString("ackForPacketId", ""),
                    directoryEntries = directory
                )
            } catch (_: Exception) {
                null
            }
        }
    }
}
