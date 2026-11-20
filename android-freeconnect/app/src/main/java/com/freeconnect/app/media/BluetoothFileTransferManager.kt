package com.freeconnect.app.media

import android.content.Context
import android.util.Base64
import com.freeconnect.app.crypto.CryptoManager
import com.freeconnect.app.mesh.MeshPacket
import com.freeconnect.app.mesh.MeshRelayEngine
import com.freeconnect.app.mesh.PacketType
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

enum class TransferStatus {
    IN_PROGRESS,
    COMPLETED,
    CANCELED,
    FAILED
}

data class FileTransferRecord(
    val transferId: String,
    val peerNodeId: String,
    val fileName: String,
    val mimeType: String,
    val totalBytes: Long,
    val transferredBytes: Long,
    val isOutgoing: Boolean,
    val localPath: String,
    val status: TransferStatus,
    val updatedAt: Long = System.currentTimeMillis()
) {
    val progress: Float
        get() = if (totalBytes <= 0L) 0f else (transferredBytes.toFloat() / totalBytes.toFloat()).coerceIn(0f, 1f)
}

/**
 * Chunked End-to-End Encrypted File Transfer Engine over Bluetooth Classic RFCOMM.
 * Supports voice notes (.m4a), images (.jpg/.png), audio files, and documents (.pdf/.txt)
 * with live progress tracking, mid-transfer cancellation, and local offline media storage.
 */
class BluetoothFileTransferManager(
    private val context: Context,
    private val cryptoManager: CryptoManager
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mediaDir: File by lazy {
        File(context.filesDir, "freeconnect_media").apply { mkdirs() }
    }

    private val activeJobs = ConcurrentHashMap<String, Job>()
    private val incomingStreams = ConcurrentHashMap<String, FileOutputStream>()

    private val _transfers = MutableStateFlow<Map<String, FileTransferRecord>>(emptyMap())
    val transfers: StateFlow<Map<String, FileTransferRecord>> = _transfers.asStateFlow()

    fun sendFileOverBluetooth(
        file: File,
        mimeType: String,
        recipientNodeId: String,
        recipientPublicKeyBase64: String,
        transport: MeshRelayEngine.TransportBridge
    ): String {
        val transferId = UUID.randomUUID().toString()
        val totalBytes = file.length()
        val record = FileTransferRecord(
            transferId = transferId,
            peerNodeId = recipientNodeId,
            fileName = file.name,
            mimeType = mimeType,
            totalBytes = totalBytes,
            transferredBytes = 0L,
            isOutgoing = true,
            localPath = file.absolutePath,
            status = TransferStatus.IN_PROGRESS
        )
        _transfers.value = _transfers.value + (transferId to record)

        val job = scope.launch {
            try {
                val allBytes = file.readBytes()
                val chunkSize = 16_384 // 16 KB chunks suited for RFCOMM SPP MTU
                val totalChunks = ((allBytes.size + chunkSize - 1) / chunkSize).coerceAtLeast(1)
                var sentBytes = 0L

                for (index in 0 until totalChunks) {
                    val start = index * chunkSize
                    val end = minOf(allBytes.size, start + chunkSize)
                    val slice = allBytes.copyOfRange(start, end)
                    val chunkJson = JSONObject().apply {
                        put("transferId", transferId)
                        put("fileName", file.name)
                        put("mimeType", mimeType)
                        put("totalBytes", totalBytes)
                        put("chunkIndex", index)
                        put("totalChunks", totalChunks)
                        put("dataB64", Base64.encodeToString(slice, Base64.NO_WRAP))
                    }.toString()

                    val packetId = "$transferId-$index"
                    val now = System.currentTimeMillis()
                    val aad = "$packetId|${cryptoManager.getLocalNodeId()}|$recipientNodeId|$now"
                    val encrypted = cryptoManager.encryptForPeer(
                        plaintext = chunkJson,
                        peerPublicKeyBase64 = recipientPublicKeyBase64,
                        associatedData = aad
                    )

                    val packet = MeshPacket(
                        packetId = packetId,
                        type = PacketType.ENCRYPTED_MESSAGE,
                        senderNodeId = cryptoManager.getLocalNodeId(),
                        recipientNodeId = recipientNodeId,
                        ttl = 2,
                        createdAt = now,
                        ciphertextBase64 = encrypted.ciphertextBase64,
                        ivBase64 = encrypted.ivBase64,
                        senderDisplayName = "__FILE_CHUNK__"
                    )

                    val ok = transport.sendPacketToNode(recipientNodeId, packet)
                    if (!ok) {
                        updateStatus(transferId, TransferStatus.FAILED, sentBytes)
                        return@launch
                    }

                    sentBytes += slice.size
                    updateStatus(transferId, TransferStatus.IN_PROGRESS, sentBytes)
                }

                updateStatus(transferId, TransferStatus.COMPLETED, totalBytes)
            } catch (_: CancellationException) {
                updateStatus(transferId, TransferStatus.CANCELED, _transfers.value[transferId]?.transferredBytes ?: 0L)
            } catch (_: Exception) {
                updateStatus(transferId, TransferStatus.FAILED, _transfers.value[transferId]?.transferredBytes ?: 0L)
            } finally {
                activeJobs.remove(transferId)
            }
        }

        activeJobs[transferId] = job
        return transferId
    }

    fun cancelTransfer(transferId: String) {
        activeJobs.remove(transferId)?.cancel()
        incomingStreams.remove(transferId)?.runCatching { close() }
        val current = _transfers.value[transferId] ?: return
        _transfers.value = _transfers.value + (
            transferId to current.copy(status = TransferStatus.CANCELED, updatedAt = System.currentTimeMillis())
        )
    }

    fun onIncomingDecryptedChunk(senderNodeId: String, chunkJsonRaw: String): FileTransferRecord? {
        return try {
            val obj = JSONObject(chunkJsonRaw)
            val transferId = obj.getString("transferId")
            val fileName = obj.getString("fileName")
            val mimeType = obj.getString("mimeType")
            val totalBytes = obj.getLong("totalBytes")
            val chunkIndex = obj.getInt("chunkIndex")
            val totalChunks = obj.getInt("totalChunks")
            val chunkBytes = Base64.decode(obj.getString("dataB64"), Base64.NO_WRAP)

            val outFile = File(mediaDir, "${transferId.take(6)}_$fileName")
            val stream = incomingStreams.getOrPut(transferId) { FileOutputStream(outFile, true) }
            stream.write(chunkBytes)

            val prevBytes = _transfers.value[transferId]?.transferredBytes ?: 0L
            val nextBytes = prevBytes + chunkBytes.size
            val done = chunkIndex + 1 >= totalChunks
            if (done) {
                stream.flush()
                stream.close()
                incomingStreams.remove(transferId)
            }

            val rec = FileTransferRecord(
                transferId = transferId,
                peerNodeId = senderNodeId,
                fileName = fileName,
                mimeType = mimeType,
                totalBytes = totalBytes,
                transferredBytes = nextBytes,
                isOutgoing = false,
                localPath = outFile.absolutePath,
                status = if (done) TransferStatus.COMPLETED else TransferStatus.IN_PROGRESS
            )
            _transfers.value = _transfers.value + (transferId to rec)
            rec
        } catch (_: Exception) {
            null
        }
    }

    private fun updateStatus(transferId: String, status: TransferStatus, bytes: Long) {
        val current = _transfers.value[transferId] ?: return
        _transfers.value = _transfers.value + (
            transferId to current.copy(
                transferredBytes = bytes,
                status = status,
                updatedAt = System.currentTimeMillis()
            )
        )
    }
}
