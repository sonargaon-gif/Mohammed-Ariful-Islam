package com.freeconnect.app.bluetooth

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import com.freeconnect.app.crypto.CryptoManager
import com.freeconnect.app.data.db.ConnectionState
import com.freeconnect.app.data.db.PeerEntity
import com.freeconnect.app.data.repository.FreeConnectRepository
import com.freeconnect.app.mesh.MeshPacket
import com.freeconnect.app.mesh.MeshRelayEngine
import com.freeconnect.app.mesh.PacketType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class ActiveLinkInfo(
    val address: String,
    val nodeId: String?,
    val displayName: String,
    val state: ConnectionState,
    val safetyNumber: String = "",
    val connectedSince: Long = System.currentTimeMillis(),
    val bytesSent: Long = 0L,
    val bytesReceived: Long = 0L,
    val errorMessage: String? = null
)

/**
 * Production Bluetooth Classic (RFCOMM/SPP) multi-peer transport engine.
 *
 * Capabilities:
 * - Hosts a persistent [BluetoothServerSocket] accepting incoming peer connections.
 * - Opens outgoing RFCOMM sockets using [BluetoothDevice.createRfcommSocketToServiceRecord].
 * - Supports multiple concurrent connected peers (up to chipset limit, default 5).
 * - Performs ECDSA-signed cryptographic handshake immediately upon socket open to authenticate devices.
 * - Uses 4-byte length-prefixed binary framing over RFCOMM streams to prevent packet fragmentation.
 * - Detects socket drops cleanly and triggers exponential-backoff auto-reconnection when enabled.
 */
class BluetoothClassicManager(
    private val context: Context,
    private val cryptoManager: CryptoManager,
    private val repository: FreeConnectRepository,
    private val bleDiscoveryManager: BleDiscoveryManager,
    private val meshRelayEngine: MeshRelayEngine
) : MeshRelayEngine.TransportBridge {

    private class PeerSocketSession(
        val address: String,
        val socket: BluetoothSocket,
        val input: DataInputStream,
        val output: DataOutputStream,
        val writeMutex: Mutex = Mutex(),
        @Volatile var nodeId: String? = null,
        var readerJob: Job? = null
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val adapter: BluetoothAdapter? get() = bluetoothManager?.adapter

    private val sessionsByAddress = ConcurrentHashMap<String, PeerSocketSession>()
    private val addressByNodeId = ConcurrentHashMap<String, String>()
    private val reconnectJobs = ConcurrentHashMap<String, Job>()
    private val manuallyDisconnected = ConcurrentHashMap.newKeySet<String>()

    private var serverSocket: BluetoothServerSocket? = null
    private var acceptJob: Job? = null
    private var receiverRegistered = false

    private val _isBluetoothEnabled = MutableStateFlow(adapter?.isEnabled == true)
    val isBluetoothEnabled: StateFlow<Boolean> = _isBluetoothEnabled.asStateFlow()

    private val _isClassicDiscovering = MutableStateFlow(false)
    val isClassicDiscovering: StateFlow<Boolean> = _isClassicDiscovering.asStateFlow()

    private val _activeLinks = MutableStateFlow<Map<String, ActiveLinkInfo>>(emptyMap())
    val activeLinks: StateFlow<Map<String, ActiveLinkInfo>> = _activeLinks.asStateFlow()

    private val _connectionError = MutableStateFlow<String?>(null)
    val connectionError: StateFlow<String?> = _connectionError.asStateFlow()

    private val bluetoothReceiver = object : BroadcastReceiver() {
        @SuppressLint("MissingPermission")
        override fun onReceive(ctx: Context, intent: Intent) {
            when (intent.action) {
                BluetoothAdapter.ACTION_STATE_CHANGED -> {
                    val state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                    val enabled = state == BluetoothAdapter.STATE_ON
                    _isBluetoothEnabled.value = enabled
                    if (enabled) {
                        startServerListener()
                    } else {
                        stopAllConnections("Bluetooth adapter was disabled")
                    }
                }
                BluetoothDevice.ACTION_FOUND -> {
                    val device: BluetoothDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    }
                    val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, (-75).toShort()).toInt()
                    if (device != null && BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) {
                        bleDiscoveryManager.mergeClassicDevice(
                            DiscoveredDevice(
                                address = device.address,
                                name = device.name ?: "Bluetooth Device",
                                rssi = rssi,
                                isFreeConnectBeacon = false,
                                isBonded = device.bondState == BluetoothDevice.BOND_BONDED,
                                advertisedNodeTag = null
                            )
                        )
                    }
                }
                BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                    _isClassicDiscovering.value = false
                }
                BluetoothDevice.ACTION_BOND_STATE_CHANGED -> {
                    val device: BluetoothDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    }
                    if (device != null && BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) {
                        val bonded = device.bondState == BluetoothDevice.BOND_BONDED
                        bleDiscoveryManager.mergeClassicDevice(
                            DiscoveredDevice(
                                address = device.address,
                                name = device.name ?: "Bluetooth Device",
                                rssi = -65,
                                isFreeConnectBeacon = false,
                                isBonded = bonded,
                                advertisedNodeTag = null
                            )
                        )
                    }
                }
            }
        }
    }

    init {
        meshRelayEngine.attachTransport(this)
        registerReceivers()
    }

    private fun registerReceivers() {
        if (receiverRegistered) return
        val filter = IntentFilter().apply {
            addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
            addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(bluetoothReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            context.registerReceiver(bluetoothReceiver, filter)
        }
        receiverRegistered = true
    }

    @SuppressLint("MissingPermission")
    fun loadBondedDevices() {
        if (!BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) return
        val bonded = adapter?.bondedDevices.orEmpty()
        for (device in bonded) {
            bleDiscoveryManager.mergeClassicDevice(
                DiscoveredDevice(
                    address = device.address,
                    name = device.name ?: "Paired Device",
                    rssi = -60,
                    isFreeConnectBeacon = false,
                    isBonded = true,
                    advertisedNodeTag = null
                )
            )
        }
    }

    @SuppressLint("MissingPermission")
    fun startClassicDiscovery() {
        if (!BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) {
            _connectionError.value = "Bluetooth permissions are required for device discovery."
            return
        }
        val btAdapter = adapter
        if (btAdapter == null || !btAdapter.isEnabled) {
            _connectionError.value = "Enable Bluetooth on this phone to scan for nearby users."
            return
        }
        loadBondedDevices()
        if (btAdapter.isDiscovering) {
            btAdapter.cancelDiscovery()
        }
        val started = btAdapter.startDiscovery()
        _isClassicDiscovering.value = started
        if (!started) {
            _connectionError.value = "Could not start Bluetooth Classic discovery."
        }
    }

    @SuppressLint("MissingPermission")
    fun stopClassicDiscovery() {
        if (!BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) return
        if (adapter?.isDiscovering == true) {
            adapter?.cancelDiscovery()
        }
        _isClassicDiscovering.value = false
    }

    @SuppressLint("MissingPermission")
    fun pairDevice(address: String) {
        if (!BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) return
        val device = adapter?.getRemoteDevice(address) ?: return
        if (device.bondState == BluetoothDevice.BOND_NONE) {
            updateLinkState(address, device.name ?: address, ConnectionState.PAIRING)
            device.createBond()
        }
    }

    /**
     * Opens the RFCOMM ServerSocket to accept incoming FreeConnect connections from nearby peers.
     */
    @SuppressLint("MissingPermission")
    fun startServerListener() {
        if (!BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) return
        val btAdapter = adapter ?: return
        if (!btAdapter.isEnabled) return
        if (acceptJob?.isActive == true) return

        acceptJob = scope.launch {
            try {
                serverSocket?.close()
                serverSocket = btAdapter.listenUsingRfcommWithServiceRecord(
                    BluetoothConstants.RFCOMM_SERVICE_NAME,
                    BluetoothConstants.RFCOMM_SERVICE_UUID
                )
                Log.i(TAG, "RFCOMM ServerSocket listening for incoming FreeConnect peers")

                while (isActive) {
                    val incomingSocket = try {
                        serverSocket?.accept()
                    } catch (e: IOException) {
                        if (isActive) Log.w(TAG, "RFCOMM accept interrupted: ${e.message}")
                        break
                    } ?: break

                    if (sessionsByAddress.size >= BluetoothConstants.MAX_CONCURRENT_RFCOMM_PEERS) {
                        Log.w(TAG, "Max concurrent RFCOMM peer limit reached; closing extra socket")
                        runCatching { incomingSocket.close() }
                        continue
                    }

                    val remoteAddress = incomingSocket.remoteDevice.address
                    val remoteName = incomingSocket.remoteDevice.name ?: remoteAddress
                    launch {
                        attachConnectedSocket(remoteAddress, remoteName, incomingSocket)
                    }
                }
            } catch (e: IOException) {
                _connectionError.value = "RFCOMM listener failed: ${e.message}"
                Log.e(TAG, "Failed to open RFCOMM server socket", e)
            }
        }
    }

    /**
     * Initiates an outgoing RFCOMM connection to a discovered or paired peer.
     */
    @SuppressLint("MissingPermission")
    fun connectToDevice(address: String) {
        if (!BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) {
            _connectionError.value = "Missing Bluetooth Connect permission."
            return
        }
        val btAdapter = adapter ?: return
        if (!btAdapter.isEnabled) {
            _connectionError.value = "Bluetooth is turned off."
            return
        }
        if (sessionsByAddress.containsKey(address)) return

        manuallyDisconnected.remove(address)
        reconnectJobs.remove(address)?.cancel()

        scope.launch {
            val device = runCatching { btAdapter.getRemoteDevice(address) }.getOrNull() ?: return@launch
            val displayName = device.name ?: address
            updateLinkState(address, displayName, ConnectionState.CONNECTING)

            // Canceling Classic discovery dramatically improves RFCOMM connection speed and stability
            if (btAdapter.isDiscovering) {
                btAdapter.cancelDiscovery()
                _isClassicDiscovering.value = false
            }

            try {
                val socket = device.createRfcommSocketToServiceRecord(BluetoothConstants.RFCOMM_SERVICE_UUID)
                socket.connect()
                _connectionError.value = null
                attachConnectedSocket(address, displayName, socket)
            } catch (e: IOException) {
                Log.w(TAG, "RFCOMM connect failed for $address: ${e.message}")
                val reason = "Could not connect to $displayName. Ensure FreeConnect is open on the other phone."
                _connectionError.value = reason
                updateLinkState(address, displayName, ConnectionState.DISCONNECTED, error = reason)
                scheduleReconnectIfEnabled(address)
            }
        }
    }

    fun disconnectDevice(address: String) {
        manuallyDisconnected.add(address)
        reconnectJobs.remove(address)?.cancel()
        closeSession(address, reason = "Disconnected by user")
    }

    override fun getConnectedPeerNodeIds(): Set<String> = addressByNodeId.keys.toSet()

    override suspend fun sendPacketToNode(targetNodeId: String, packet: MeshPacket): Boolean {
        val address = addressByNodeId[targetNodeId] ?: return false
        val session = sessionsByAddress[address] ?: return false
        return writePacket(session, packet)
    }

    private suspend fun attachConnectedSocket(
        address: String,
        fallbackName: String,
        socket: BluetoothSocket
    ) {
        closeSession(address, reason = null)
        val session = PeerSocketSession(
            address = address,
            socket = socket,
            input = DataInputStream(socket.inputStream),
            output = DataOutputStream(socket.outputStream)
        )
        sessionsByAddress[address] = session
        updateLinkState(address, fallbackName, ConnectionState.AUTHENTICATING)

        // Start framed reader loop
        session.readerJob = scope.launch {
            readLoop(session)
        }

        // Send cryptographically signed HANDSHAKE packet
        sendHandshake(session, isAck = false)
    }

    private suspend fun sendHandshake(session: PeerSocketSession, isAck: Boolean) {
        val profile = repository.ensureLocalProfile()
        val localNodeId = cryptoManager.getLocalNodeId()
        val timestamp = System.currentTimeMillis()
        val nonce = cryptoManager.generateNonceBase64()
        val signature = cryptoManager.signHandshake(localNodeId, timestamp, nonce)

        val handshake = MeshPacket(
            packetId = UUID.randomUUID().toString(),
            type = if (isAck) PacketType.HANDSHAKE_ACK else PacketType.HANDSHAKE,
            senderNodeId = localNodeId,
            recipientNodeId = session.nodeId ?: "BROADCAST",
            ttl = 1,
            createdAt = timestamp,
            senderDisplayName = profile.displayName,
            senderPublicKeyBase64 = cryptoManager.getPublicKeyBase64(),
            nonceBase64 = nonce,
            signatureBase64 = signature,
            avatarColorIndex = profile.avatarColorIndex
        )
        writePacket(session, handshake)
    }

    private suspend fun writePacket(session: PeerSocketSession, packet: MeshPacket): Boolean {
        val payload = packet.toJson().toByteArray(Charsets.UTF_8)
        if (payload.size > BluetoothConstants.MAX_FRAME_BYTES) return false

        return try {
            session.writeMutex.withLock {
                session.output.writeInt(payload.size)
                session.output.write(payload)
                session.output.flush()
            }
            incrementTraffic(session.address, sentDelta = payload.size.toLong(), recvDelta = 0L)
            true
        } catch (e: IOException) {
            Log.w(TAG, "Write failed on ${session.address}: ${e.message}")
            handleUnexpectedDisconnect(session.address, "Connection interrupted while sending")
            false
        }
    }

    private suspend fun readLoop(session: PeerSocketSession) {
        try {
            while (scope.isActive && session.socket.isConnected) {
                val frameLength = session.input.readInt()
                if (frameLength <= 0 || frameLength > BluetoothConstants.MAX_FRAME_BYTES) {
                    throw IOException("Invalid frame length: $frameLength")
                }
                val buffer = ByteArray(frameLength)
                session.input.readFully(buffer)
                incrementTraffic(session.address, sentDelta = 0L, recvDelta = frameLength.toLong())

                val rawJson = String(buffer, Charsets.UTF_8)
                val packet = MeshPacket.fromJson(rawJson) ?: continue
                handleSessionPacket(session, packet)
            }
        } catch (e: IOException) {
            Log.w(TAG, "RFCOMM stream closed for ${session.address}: ${e.message}")
            handleUnexpectedDisconnect(session.address, "Peer out of Bluetooth range or disconnected")
        }
    }

    private suspend fun handleSessionPacket(session: PeerSocketSession, packet: MeshPacket) {
        when (packet.type) {
            PacketType.HANDSHAKE, PacketType.HANDSHAKE_ACK -> {
                val valid = cryptoManager.verifyHandshake(
                    peerNodeId = packet.senderNodeId,
                    peerPublicKeyBase64 = packet.senderPublicKeyBase64,
                    timestamp = packet.createdAt,
                    nonceBase64 = packet.nonceBase64,
                    signatureBase64 = packet.signatureBase64
                )
                if (!valid) {
                    Log.e(TAG, "Device authentication failed for ${session.address}; closing socket")
                    closeSession(session.address, reason = "Cryptographic handshake verification failed")
                    return
                }

                val safetyNumber = cryptoManager.computeSafetyNumber(packet.senderPublicKeyBase64)
                session.nodeId = packet.senderNodeId
                addressByNodeId[packet.senderNodeId] = session.address

                repository.upsertPeer(
                    PeerEntity(
                        nodeId = packet.senderNodeId,
                        bluetoothAddress = session.address,
                        displayName = packet.senderDisplayName.ifBlank { "FreeConnect Peer" },
                        publicKeyBase64 = packet.senderPublicKeyBase64,
                        safetyNumber = safetyNumber,
                        isPaired = true,
                        isDirectlyConnected = true,
                        lastRssi = -58,
                        lastSeenAt = System.currentTimeMillis(),
                        reachableViaNodeId = null,
                        hopDistance = 1,
                        avatarColorIndex = packet.avatarColorIndex
                    )
                )

                _activeLinks.value = _activeLinks.value + (
                    session.address to ActiveLinkInfo(
                        address = session.address,
                        nodeId = packet.senderNodeId,
                        displayName = packet.senderDisplayName.ifBlank { session.address },
                        state = ConnectionState.CONNECTED,
                        safetyNumber = safetyNumber
                    )
                )

                if (packet.type == PacketType.HANDSHAKE) {
                    sendHandshake(session, isAck = true)
                }

                // Trigger offline store-and-forward queue flush and mesh directory sync
                meshRelayEngine.onPeerConnected(packet.senderNodeId)
            }

            PacketType.HEARTBEAT -> Unit

            else -> {
                val authenticatedNodeId = session.nodeId ?: return
                meshRelayEngine.onPacketReceived(authenticatedNodeId, packet)
            }
        }
    }

    private fun handleUnexpectedDisconnect(address: String, reason: String) {
        if (!sessionsByAddress.containsKey(address)) return
        closeSession(address, reason)
        if (!manuallyDisconnected.contains(address)) {
            scheduleReconnectIfEnabled(address)
        }
    }

    private fun scheduleReconnectIfEnabled(address: String) {
        if (manuallyDisconnected.contains(address)) return
        if (reconnectJobs[address]?.isActive == true) return

        reconnectJobs[address] = scope.launch {
            var delayMs = BluetoothConstants.RECONNECT_INITIAL_DELAY_MS
            repeat(5) {
                val settings = repository.settings.first()
                if (!settings.autoReconnect || manuallyDisconnected.contains(address)) return@launch
                if (sessionsByAddress.containsKey(address)) return@launch

                delay(delayMs)
                if (adapter?.isEnabled == true && !sessionsByAddress.containsKey(address)) {
                    connectToDevice(address)
                }
                delayMs = (delayMs * 2).coerceAtMost(BluetoothConstants.RECONNECT_MAX_DELAY_MS)
            }
        }
    }

    private fun closeSession(address: String, reason: String?) {
        val removed = sessionsByAddress.remove(address) ?: return
        removed.readerJob?.cancel()
        runCatching { removed.socket.close() }

        removed.nodeId?.let { nodeId ->
            addressByNodeId.remove(nodeId)
            scope.launch { repository.updatePeerConnected(nodeId, false) }
        }

        if (reason != null) {
            val prev = _activeLinks.value[address]
            _activeLinks.value = _activeLinks.value + (
                address to ActiveLinkInfo(
                    address = address,
                    nodeId = removed.nodeId,
                    displayName = prev?.displayName ?: address,
                    state = ConnectionState.DISCONNECTED,
                    safetyNumber = prev?.safetyNumber.orEmpty(),
                    errorMessage = reason
                )
            )
        } else {
            _activeLinks.value = _activeLinks.value - address
        }
    }

    fun stopAllConnections(reason: String) {
        acceptJob?.cancel()
        runCatching { serverSocket?.close() }
        serverSocket = null
        reconnectJobs.values.forEach { it.cancel() }
        reconnectJobs.clear()
        sessionsByAddress.keys.toList().forEach { closeSession(it, reason) }
        scope.launch { repository.markAllPeersDisconnected() }
    }

    fun clearError() {
        _connectionError.value = null
    }

    private fun updateLinkState(
        address: String,
        displayName: String,
        state: ConnectionState,
        error: String? = null
    ) {
        val current = _activeLinks.value[address]
        _activeLinks.value = _activeLinks.value + (
            address to (current?.copy(
                displayName = displayName,
                state = state,
                errorMessage = error
            ) ?: ActiveLinkInfo(
                address = address,
                nodeId = null,
                displayName = displayName,
                state = state,
                errorMessage = error
            ))
        )
    }

    private fun incrementTraffic(address: String, sentDelta: Long, recvDelta: Long) {
        val current = _activeLinks.value[address] ?: return
        _activeLinks.value = _activeLinks.value + (
            address to current.copy(
                bytesSent = current.bytesSent + sentDelta,
                bytesReceived = current.bytesReceived + recvDelta
            )
        )
    }

    companion object {
        private const val TAG = "FreeConnectClassic"
    }
}
