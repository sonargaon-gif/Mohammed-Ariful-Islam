package com.freeconnect.offline

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.NetworkInfo
import android.net.wifi.WpsInfo
import android.net.wifi.p2p.WifiP2pConfig
import android.net.wifi.p2p.WifiP2pDevice
import android.net.wifi.p2p.WifiP2pInfo
import android.net.wifi.p2p.WifiP2pManager
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceInfo
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceRequest
import android.os.Build
import android.util.Log
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * FreeConnect Android Wi-Fi Direct (P2P) High-Speed Offline Transport Manager
 *
 * Supplements Bluetooth Low Energy (BLE) with direct Android-to-Android Wi-Fi P2P
 * discovery, DNS-SD identity advertisement (`_freeconnect._tcp`), and length-prefixed
 * local TCP sockets (192.168.49.x:47777) for fast text, voice note, and file transfers
 * without any router, mobile data, or internet server.
 */
@SuppressLint("MissingPermission")
class FreeConnectWifiDirectManager(private val context: Context) {

    companion object {
        private const val TAG = "FreeConnectWifiDirect"
        private const val P2P_PORT = 47777
        private const val SERVICE_INSTANCE = "FreeConnectP2P"
        private const val SERVICE_REG_TYPE = "_freeconnect._tcp"
        private const val MAX_FRAME_BYTES = 16 * 1024 * 1024 // 16 MB max single packet/file frame
        private const val CLIENT_CONNECT_RETRIES = 5
        private const val CLIENT_CONNECT_RETRY_DELAY_MS = 650L
    }

    var onPeerDiscovered: ((peerId: String, name: String, deviceCode: String?, connected: Boolean) -> Unit)? = null
    var onConnectionStateChanged: ((peerId: String, peerName: String?, state: String, message: String?) -> Unit)? = null
    var onPacketReceived: ((peerId: String, packetJson: String) -> Unit)? = null
    var onScanStateChanged: ((state: String, message: String?) -> Unit)? = null
    var onError: ((message: String) -> Unit)? = null

    private val manager: WifiP2pManager? =
        context.getSystemService(Context.WIFI_P2P_SERVICE) as? WifiP2pManager
    private var channel: WifiP2pManager.Channel? = null
    private val ioExecutor = Executors.newCachedThreadPool()

    private val discoveredPeers = ConcurrentHashMap<String, WifiP2pDevice>()
    private val peerDeviceCodes = ConcurrentHashMap<String, String>()
    private val peerDisplayNames = ConcurrentHashMap<String, String>()
    private val activeSockets = ConcurrentHashMap<String, Socket>()
    private val activeStreams = ConcurrentHashMap<String, DataOutputStream>()

    private var serverSocket: ServerSocket? = null
    private val serverRunning = AtomicBoolean(false)
    private var isReceiverRegistered = false
    private var isP2pEnabled = false
    private var activeTargetPeerId: String? = null
    private var localServiceInfo: WifiP2pDnsSdServiceInfo? = null
    private var serviceRequest: WifiP2pDnsSdServiceRequest? = null

    private var localDeviceId: String = "FC-ANDROID"
    private var localDisplayName: String = "FreeConnect Android"

    fun initialize() {
        val mgr = manager ?: run {
            onError?.invoke("Wi-Fi Direct hardware is not available on this Android device.")
            return
        }
        if (channel == null) {
            channel = mgr.initialize(context, context.mainLooper) {
                Log.w(TAG, "Wi-Fi P2P channel disconnected; re-initializing.")
                channel = mgr.initialize(context, context.mainLooper, null)
            }
        }
        registerReceiverIfNeeded()
    }

    fun updateLocalIdentity(deviceId: String, displayName: String) {
        localDeviceId = deviceId
        localDisplayName = displayName
        registerLocalDnsSdService()
    }

    private fun registerReceiverIfNeeded() {
        if (isReceiverRegistered) return
        val filter = IntentFilter().apply {
            addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION)
            addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION)
            addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION)
            addAction(WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(p2pReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(p2pReceiver, filter)
        }
        isReceiverRegistered = true
    }

    private fun registerLocalDnsSdService() {
        val mgr = manager ?: return
        val ch = channel ?: return

        val record = mapOf(
            "deviceId" to localDeviceId,
            "name" to localDisplayName.take(32),
            "port" to P2P_PORT.toString(),
            "proto" to "fc-p2p-1"
        )

        mgr.clearLocalServices(ch, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                val info = WifiP2pDnsSdServiceInfo.newInstance(
                    SERVICE_INSTANCE,
                    SERVICE_REG_TYPE,
                    record
                )
                localServiceInfo = info
                mgr.addLocalService(ch, info, object : WifiP2pManager.ActionListener {
                    override fun onSuccess() {
                        Log.d(TAG, "Registered Wi-Fi Direct DNS-SD service ($localDeviceId)")
                    }

                    override fun onFailure(reason: Int) {
                        Log.w(TAG, "DNS-SD local service registration failed (code $reason)")
                    }
                })
            }

            override fun onFailure(reason: Int) {
                Log.w(TAG, "Failed clearing old DNS-SD services (code $reason)")
            }
        })
    }

    fun startDiscovery() {
        val mgr = manager ?: run {
            onError?.invoke("Wi-Fi Direct is not supported on this device.")
            return
        }
        if (channel == null) initialize()
        val ch = channel ?: return

        registerLocalDnsSdService()
        startDnsSdServiceDiscovery(mgr, ch)

        onScanStateChanged?.invoke("searching", "Searching nearby Wi-Fi Direct peers...")
        mgr.discoverPeers(ch, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                Log.d(TAG, "Wi-Fi Direct peer discovery started.")
            }

            override fun onFailure(reason: Int) {
                val hint = when (reason) {
                    WifiP2pManager.P2P_UNSUPPORTED -> "Wi-Fi Direct is unsupported on this hardware."
                    WifiP2pManager.BUSY -> "Wi-Fi Direct radio is busy. Try again in a moment."
                    else -> "Wi-Fi Direct discovery failed (code $reason). Ensure Wi-Fi is turned on and Nearby Devices permission is granted."
                }
                onScanStateChanged?.invoke("idle", hint)
                onError?.invoke(hint)
            }
        })
    }

    private fun startDnsSdServiceDiscovery(mgr: WifiP2pManager, ch: WifiP2pManager.Channel) {
        val txtListener = WifiP2pManager.DnsSdTxtRecordListener { _, txtRecordMap, srcDevice ->
            val address = srcDevice.deviceAddress ?: return@DnsSdTxtRecordListener
            discoveredPeers[address] = srcDevice
            val code = txtRecordMap["deviceId"]
            val friendlyName = txtRecordMap["name"] ?: srcDevice.deviceName ?: "FreeConnect Android"
            if (!code.isNullOrBlank()) peerDeviceCodes[address] = code
            peerDisplayNames[address] = friendlyName
            val connected = activeSockets.containsKey(address)
            onPeerDiscovered?.invoke(address, friendlyName, code, connected)
        }

        val servListener = WifiP2pManager.DnsSdServiceResponseListener { _, _, srcDevice ->
            val address = srcDevice.deviceAddress ?: return@DnsSdServiceResponseListener
            discoveredPeers[address] = srcDevice
            val name = peerDisplayNames[address] ?: srcDevice.deviceName ?: "FreeConnect Android"
            val code = peerDeviceCodes[address]
            val connected = activeSockets.containsKey(address)
            onPeerDiscovered?.invoke(address, name, code, connected)
        }

        mgr.setDnsSdResponseListeners(ch, servListener, txtListener)
        mgr.clearServiceRequests(ch, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                val req = WifiP2pDnsSdServiceRequest.newInstance()
                serviceRequest = req
                mgr.addServiceRequest(ch, req, object : WifiP2pManager.ActionListener {
                    override fun onSuccess() {
                        mgr.discoverServices(ch, null)
                    }

                    override fun onFailure(reason: Int) {
                        Log.w(TAG, "addServiceRequest failed (code $reason)")
                    }
                })
            }

            override fun onFailure(reason: Int) {
                Log.w(TAG, "clearServiceRequests failed (code $reason)")
            }
        })
    }

    fun stopDiscovery() {
        val mgr = manager ?: return
        val ch = channel ?: return
        mgr.stopPeerDiscovery(ch, null)
        mgr.clearServiceRequests(ch, null)
        onScanStateChanged?.invoke("idle", null)
    }

    fun connectPeer(peerId: String) {
        val mgr = manager ?: return
        val ch = channel ?: return
        val device = discoveredPeers[peerId]
        if (device == null) {
            onError?.invoke("Wi-Fi Direct peer $peerId is not currently discovered. Scan again first.")
            return
        }

        activeTargetPeerId = peerId
        val displayName = peerDisplayNames[peerId] ?: device.deviceName ?: "Android Peer"

        val config = WifiP2pConfig().apply {
            deviceAddress = device.deviceAddress
            wps.setup = WpsInfo.PBC
            groupOwnerIntent = 7 // Balanced negotiation between both Android devices
        }

        onConnectionStateChanged?.invoke(
            peerId,
            displayName,
            "connecting",
            "Negotiating Wi-Fi Direct P2P link with $displayName..."
        )

        mgr.connect(ch, config, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                Log.d(TAG, "Wi-Fi Direct invitation accepted/initiated for $peerId")
            }

            override fun onFailure(reason: Int) {
                onConnectionStateChanged?.invoke(
                    peerId,
                    displayName,
                    "disconnected",
                    "Wi-Fi Direct connection failed (code $reason)."
                )
            }
        })
    }

    fun disconnectPeer(peerId: String) {
        activeStreams.remove(peerId)?.let { runCatching { it.close() } }
        activeSockets.remove(peerId)?.let { runCatching { it.close() } }
        if (activeTargetPeerId == peerId) {
            activeTargetPeerId = null
        }

        val mgr = manager
        val ch = channel
        if (mgr != null && ch != null) {
            mgr.cancelConnect(ch, null)
            mgr.removeGroup(ch, null)
        }
        onConnectionStateChanged?.invoke(peerId, peerDisplayNames[peerId], "disconnected", "Disconnected from Wi-Fi Direct.")
    }

    fun isPeerConnected(peerId: String): Boolean {
        val socket = activeSockets[peerId]
        return socket != null && socket.isConnected && !socket.isClosed
    }

    /**
     * High-speed length-prefixed UTF-8 packet writer (4-byte big-endian length + payload).
     * Handles large voice notes, images, and multi-MB file chunks cleanly without newline issues.
     */
    fun sendPacket(peerId: String, packetJson: String): Boolean {
        val out = activeStreams[peerId] ?: return false
        val payload = packetJson.toByteArray(StandardCharsets.UTF_8)
        if (payload.size > MAX_FRAME_BYTES) {
            onError?.invoke("Packet exceeds Wi-Fi Direct 16 MB frame limit.")
            return false
        }

        return try {
            ioExecutor.execute {
                try {
                    synchronized(out) {
                        out.writeInt(payload.size)
                        out.write(payload)
                        out.flush()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Wi-Fi Direct write failed for $peerId", e)
                    closePeerSocket(peerId, "Wi-Fi Direct transfer interrupted: ${e.message}")
                }
            }
            true
        } catch (e: Exception) {
            onError?.invoke("Wi-Fi Direct send failed: ${e.message}")
            false
        }
    }

    fun shutdown() {
        stopDiscovery()
        serverRunning.set(false)
        runCatching { serverSocket?.close() }
        serverSocket = null

        val mgr = manager
        val ch = channel
        if (mgr != null && ch != null) {
            runCatching { mgr.clearLocalServices(ch, null) }
            runCatching { mgr.removeGroup(ch, null) }
        }

        if (isReceiverRegistered) {
            runCatching { context.unregisterReceiver(p2pReceiver) }
            isReceiverRegistered = false
        }

        activeStreams.values.forEach { runCatching { it.close() } }
        activeSockets.values.forEach { runCatching { it.close() } }
        activeStreams.clear()
        activeSockets.clear()
        ioExecutor.shutdownNow()
    }

    private val p2pReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val mgr = manager ?: return
            val ch = channel ?: return

            when (intent.action) {
                WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION -> {
                    val state = intent.getIntExtra(WifiP2pManager.EXTRA_WIFI_STATE, -1)
                    isP2pEnabled = (state == WifiP2pManager.WIFI_P2P_STATE_ENABLED)
                    if (!isP2pEnabled) {
                        onScanStateChanged?.invoke("idle", "Wi-Fi Direct is disabled. Turn on Wi-Fi to use high-speed P2P.")
                    }
                }

                WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION -> {
                    mgr.requestPeers(ch) { peerList ->
                        for (device in peerList.deviceList) {
                            val id = device.deviceAddress
                            discoveredPeers[id] = device
                            val name = peerDisplayNames[id] ?: device.deviceName ?: "Android Peer"
                            val code = peerDeviceCodes[id]
                            val connected = isPeerConnected(id)
                            onPeerDiscovered?.invoke(id, name, code, connected)
                        }
                    }
                }

                WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION -> {
                    @Suppress("DEPRECATION")
                    val networkInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(WifiP2pManager.EXTRA_NETWORK_INFO, NetworkInfo::class.java)
                    } else {
                        intent.getParcelableExtra(WifiP2pManager.EXTRA_NETWORK_INFO)
                    }

                    if (networkInfo?.isConnected == true) {
                        mgr.requestConnectionInfo(ch) { info: WifiP2pInfo? ->
                            if (info == null || !info.groupFormed) return@requestConnectionInfo
                            val peerKey = activeTargetPeerId
                                ?: info.groupOwnerAddress?.hostAddress
                                ?: "wifi-direct-peer"

                            if (info.isGroupOwner) {
                                startGroupOwnerSocketServer(peerKey)
                            } else {
                                val host = info.groupOwnerAddress?.hostAddress ?: return@requestConnectionInfo
                                connectToGroupOwnerWithRetry(peerKey, host)
                            }
                        }
                    } else {
                        // Wi-Fi P2P group dissolved
                        val openPeers = activeSockets.keys.toList()
                        openPeers.forEach { closePeerSocket(it, "Wi-Fi Direct P2P group closed.") }
                    }
                }
            }
        }
    }

    private fun startGroupOwnerSocketServer(defaultPeerKey: String) {
        if (serverRunning.getAndSet(true)) return

        ioExecutor.execute {
            try {
                serverSocket?.close()
                val srv = ServerSocket().apply {
                    reuseAddress = true
                    bind(InetSocketAddress(P2P_PORT))
                }
                serverSocket = srv
                Log.d(TAG, "Wi-Fi Direct Group Owner ServerSocket listening on port $P2P_PORT")

                while (serverRunning.get() && !srv.isClosed) {
                    val client = srv.accept()
                    val peerKey = activeTargetPeerId
                        ?: client.inetAddress?.hostAddress
                        ?: defaultPeerKey
                    ioExecutor.execute {
                        attachSocket(peerKey, client)
                    }
                }
            } catch (e: Exception) {
                if (serverRunning.get()) {
                    onError?.invoke("Wi-Fi Direct server socket error: ${e.message}")
                }
            } finally {
                serverRunning.set(false)
            }
        }
    }

    private fun connectToGroupOwnerWithRetry(peerKey: String, host: String) {
        ioExecutor.execute {
            var lastError: Exception? = null
            for (attempt in 1..CLIENT_CONNECT_RETRIES) {
                try {
                    val socket = Socket()
                    socket.tcpNoDelay = true
                    socket.connect(InetSocketAddress(host, P2P_PORT), 5000)
                    attachSocket(peerKey, socket)
                    return@execute
                } catch (e: Exception) {
                    lastError = e
                    Log.w(TAG, "Wi-Fi Direct connect attempt $attempt/$CLIENT_CONNECT_RETRIES to $host failed: ${e.message}")
                    if (attempt < CLIENT_CONNECT_RETRIES) {
                        runCatching { Thread.sleep(CLIENT_CONNECT_RETRY_DELAY_MS) }
                    }
                }
            }

            onConnectionStateChanged?.invoke(
                peerKey,
                peerDisplayNames[peerKey],
                "disconnected",
                "Wi-Fi Direct socket failed after $CLIENT_CONNECT_RETRIES attempts: ${lastError?.message}"
            )
        }
    }

    private fun attachSocket(peerId: String, socket: Socket) {
        socket.tcpNoDelay = true
        socket.keepAlive = true
        activeSockets[peerId] = socket
        activeStreams[peerId] = DataOutputStream(BufferedOutputStream(socket.getOutputStream()))

        val name = peerDisplayNames[peerId]
            ?: discoveredPeers[peerId]?.deviceName
            ?: "Android Wi-Fi Direct Peer"

        onConnectionStateChanged?.invoke(
            peerId,
            name,
            "connected",
            "Connected via High-Speed Native Wi-Fi Direct (P2P)."
        )

        try {
            val input = DataInputStream(BufferedInputStream(socket.getInputStream()))
            while (!socket.isClosed) {
                val frameLength = input.readInt()
                if (frameLength <= 0 || frameLength > MAX_FRAME_BYTES) {
                    throw IllegalStateException("Invalid Wi-Fi Direct frame size: $frameLength")
                }
                val buffer = ByteArray(frameLength)
                input.readFully(buffer)
                val packetJson = String(buffer, StandardCharsets.UTF_8)
                if (packetJson.isNotBlank()) {
                    onPacketReceived?.invoke(peerId, packetJson)
                }
            }
        } catch (_: Exception) {
            // Peer closed socket or left Wi-Fi Direct range
        } finally {
            closePeerSocket(peerId, "Wi-Fi Direct connection closed.")
        }
    }

    private fun closePeerSocket(peerId: String, reason: String) {
        val removedStream = activeStreams.remove(peerId)
        val removedSocket = activeSockets.remove(peerId)
        runCatching { removedStream?.close() }
        runCatching { removedSocket?.close() }
        if (removedStream != null || removedSocket != null) {
            val name = peerDisplayNames[peerId] ?: discoveredPeers[peerId]?.deviceName
            onConnectionStateChanged?.invoke(peerId, name, "disconnected", reason)
        }
    }
}
