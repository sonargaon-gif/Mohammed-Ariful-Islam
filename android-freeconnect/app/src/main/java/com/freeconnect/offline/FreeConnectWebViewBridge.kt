package com.freeconnect.offline

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Native Android WebView JavaScript Bridge (`window.FreeConnectNative`)
 *
 * Connects the FreeConnect web UI (`src/utils/nativeOfflineBridge.ts`) directly to:
 *   1. `FreeConnectBleManager` (Android ↔ iPhone & Android ↔ Android pure BLE)
 *   2. `FreeConnectWifiDirectManager` (Android ↔ Android high-speed Wi-Fi Direct P2P)
 *
 * When a peer is connected over both BLE and Wi-Fi Direct, outgoing packets automatically
 * prefer Wi-Fi Direct for faster voice note & file transfers while falling back to BLE seamlessly.
 */
class FreeConnectWebViewBridge(
    context: Context,
    private val webView: WebView
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val bleManager = FreeConnectBleManager(context)
    private val wifiDirectManager = FreeConnectWifiDirectManager(context)
    private val peerTransports = ConcurrentHashMap<String, String>()

    init {
        wifiDirectManager.initialize()
        bindCallbacks()
    }

    private fun bindCallbacks() {
        // BLE callbacks (Cross-platform Android ↔ iPhone & Android ↔ Android)
        bleManager.onPeerDiscovered = { peerId, name, deviceCode, rssi, connected ->
            peerTransports.putIfAbsent(peerId, "native_ble")
            val peer = JSONObject().apply {
                put("id", peerId)
                put("name", name)
                if (deviceCode != null) put("deviceCode", deviceCode)
                put("transport", "native_ble")
                put("rssi", rssi)
                put("platform", "unknown")
                put("connected", connected)
            }
            emitEvent(JSONObject().apply {
                put("type", "peer_discovered")
                put("peer", peer)
            })
        }

        bleManager.onPeerLost = { peerId ->
            emitEvent(JSONObject().apply {
                put("type", "peer_lost")
                put("peerId", peerId)
            })
        }

        bleManager.onConnectionRequest = { peerId, peerName, deviceCode ->
            peerTransports[peerId] = "native_ble"
            emitEvent(JSONObject().apply {
                put("type", "connection_request")
                put("peerId", peerId)
                put("peerName", peerName)
                if (deviceCode != null) put("deviceCode", deviceCode)
                put("platform", "unknown")
                put("transport", "native_ble")
            })
        }

        bleManager.onBluetoothStateChanged = { enabled, hwOn, perm, discoverable, message ->
            emitEvent(JSONObject().apply {
                put("type", "bluetooth_state")
                put("enabled", enabled)
                put("hardwarePoweredOn", hwOn)
                put("permissionState", perm)
                put("discoverable", discoverable)
                if (message != null) put("message", message)
            })
        }

        bleManager.onConnectionStateChanged = { peerId, peerName, state, message ->
            if (state == "connected" && !wifiDirectManager.isPeerConnected(peerId)) {
                peerTransports[peerId] = "native_ble"
            }
            emitEvent(JSONObject().apply {
                put("type", "connection_state")
                put("peerId", peerId)
                if (peerName != null) put("peerName", peerName)
                put("transport", "native_ble")
                put("state", state)
                if (message != null) put("message", message)
            })
        }

        bleManager.onPacketReceived = { peerId, packetJson ->
            emitEvent(JSONObject().apply {
                put("type", "packet_received")
                put("peerId", peerId)
                put("transport", "native_ble")
                put("packetJson", packetJson)
            })
        }

        bleManager.onScanStateChanged = { state, message ->
            emitEvent(JSONObject().apply {
                put("type", "scan_state")
                put("state", state)
                if (message != null) put("message", message)
            })
        }

        bleManager.onError = { message ->
            emitEvent(JSONObject().apply {
                put("type", "error")
                put("message", message)
            })
        }

        // Wi-Fi Direct callbacks (High-Speed Android ↔ Android P2P)
        wifiDirectManager.onPeerDiscovered = { peerId, name, deviceCode, connected ->
            peerTransports[peerId] = "native_wifi_direct"
            val peer = JSONObject().apply {
                put("id", peerId)
                put("name", name)
                if (deviceCode != null) put("deviceCode", deviceCode)
                put("transport", "native_wifi_direct")
                put("platform", "android")
                put("connected", connected)
            }
            emitEvent(JSONObject().apply {
                put("type", "peer_discovered")
                put("peer", peer)
            })
        }

        wifiDirectManager.onConnectionStateChanged = { peerId, peerName, state, message ->
            if (state == "connected") {
                peerTransports[peerId] = "native_wifi_direct"
            }
            emitEvent(JSONObject().apply {
                put("type", "connection_state")
                put("peerId", peerId)
                if (peerName != null) put("peerName", peerName)
                put("transport", "native_wifi_direct")
                put("state", state)
                if (message != null) put("message", message)
            })
        }

        wifiDirectManager.onPacketReceived = { peerId, packetJson ->
            emitEvent(JSONObject().apply {
                put("type", "packet_received")
                put("peerId", peerId)
                put("transport", "native_wifi_direct")
                put("packetJson", packetJson)
            })
        }

        wifiDirectManager.onScanStateChanged = { state, message ->
            emitEvent(JSONObject().apply {
                put("type", "scan_state")
                put("state", state)
                if (message != null) put("message", message)
            })
        }

        wifiDirectManager.onError = { message ->
            emitEvent(JSONObject().apply {
                put("type", "error")
                put("message", message)
            })
        }
    }

    // MARK: - JS -> Native Interface (exact contract in src/utils/nativeOfflineBridge.ts)

    @JavascriptInterface
    fun getPlatformInfo(): String {
        return JSONObject().apply {
            put("platform", "android_native")
            put("transports", JSONArray(listOf("native_ble", "native_wifi_direct")))
        }.toString()
    }

    @JavascriptInterface
    fun setLocalIdentity(json: String) {
        runCatching {
            val obj = JSONObject(json)
            val deviceId = obj.optString("deviceId", "FC-ANDROID")
            val name = obj.optString("name", "FreeConnect Android")
            bleManager.updateLocalIdentity(deviceId)
            wifiDirectManager.updateLocalIdentity(deviceId, name)
        }
    }

    @JavascriptInterface
    fun startDiscovery(transport: String) {
        if (transport == "all" || transport == "native_ble") {
            bleManager.startDiscovery()
        }
        if (transport == "all" || transport == "native_wifi_direct") {
            wifiDirectManager.startDiscovery()
        }
    }

    @JavascriptInterface
    fun stopDiscovery() {
        bleManager.stopDiscovery()
        wifiDirectManager.stopDiscovery()
    }

    @JavascriptInterface
    fun connectPeer(peerId: String, transport: String) {
        val chosen = if (transport.isNotBlank()) transport else peerTransports[peerId] ?: "native_ble"
        if (chosen == "native_wifi_direct") {
            wifiDirectManager.connectPeer(peerId)
        } else {
            bleManager.connectPeer(peerId)
        }
    }

    @JavascriptInterface
    fun setBluetoothEnabled(enabled: Boolean) {
        bleManager.setBluetoothEnabled(enabled)
        if (!enabled) {
            wifiDirectManager.stopDiscovery()
        }
    }

    @JavascriptInterface
    fun requestBluetoothPermission() {
        bleManager.emitBluetoothState()
    }

    @JavascriptInterface
    fun respondConnectionRequest(peerId: String, accept: Boolean, transport: String) {
        val chosen = if (transport.isNotBlank()) transport else peerTransports[peerId] ?: "native_ble"
        if (chosen == "native_ble") {
            bleManager.respondToConnectionRequest(peerId, accept)
            return
        }
        if (!accept) {
            disconnectPeer(peerId)
            emitEvent(JSONObject().apply {
                put("type", "connection_state")
                put("peerId", peerId)
                put("transport", chosen)
                put("state", "failed")
                put("message", "Connection Rejected.")
            })
            return
        }
        connectPeer(peerId, chosen)
    }

    @JavascriptInterface
    fun startCodeHost(commitment: String, nonce: String, expiresAt: Long) {
        // Ensure both local radios are discoverable while hosting a temporary 6-digit connection code
        bleManager.startDiscovery()
        wifiDirectManager.startDiscovery()
    }

    @JavascriptInterface
    fun cancelCodeHost() {
        // Code session cancelled on web layer
    }

    @JavascriptInterface
    fun sendCodeJoinRequest(peerId: String, nonce: String, proof: String, transport: String) {
        connectPeer(peerId, transport)
    }

    @JavascriptInterface
    fun disconnectPeer(peerId: String) {
        bleManager.disconnectPeer(peerId)
        wifiDirectManager.disconnectPeer(peerId)
    }

    @JavascriptInterface
    fun sendPacket(peerId: String, packetJson: String): Boolean {
        // Automatically prefer high-speed Wi-Fi Direct when connected for faster transfers
        if (wifiDirectManager.isPeerConnected(peerId)) {
            if (wifiDirectManager.sendPacket(peerId, packetJson)) {
                return true
            }
        }
        val transport = peerTransports[peerId] ?: "native_ble"
        return if (transport == "native_wifi_direct") {
            wifiDirectManager.sendPacket(peerId, packetJson)
        } else {
            bleManager.sendPacket(peerId, packetJson)
        }
    }

    fun destroy() {
        bleManager.shutdown()
        wifiDirectManager.shutdown()
    }

    private fun emitEvent(event: JSONObject) {
        val payload = event.toString()
        mainHandler.post {
            webView.evaluateJavascript(
                "window.__freeConnectNativeEvent && window.__freeConnectNativeEvent($payload);",
                null
            )
        }
    }
}
