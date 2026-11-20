package com.freeconnect.offline

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * FreeConnect Dual-Role Android BLE Manager (Central + GATT Server Peripheral)
 *
 * Uses the exact same GATT UUIDs and FC1 chunk framing as iOS (`FreeConnectBLEManager.swift`)
 * and Web Bluetooth (`src/utils/webBluetoothContact.ts`) so:
 *   • Android ↔ iPhone
 *   • Android ↔ Android
 *   • Android ↔ Desktop Chrome (Web Bluetooth)
 * communicate directly over Bluetooth Low Energy with ZERO Wi-Fi, ZERO mobile data,
 * and ZERO internet servers.
 */
@SuppressLint("MissingPermission")
class FreeConnectBleManager(private val context: Context) {

    companion object {
        val SERVICE_UUID: UUID = UUID.fromString("F000FC01-0451-4000-B000-000000000000")
        val TX_CHAR_UUID: UUID = UUID.fromString("F000FC02-0451-4000-B000-000000000000")
        val RX_CHAR_UUID: UUID = UUID.fromString("F000FC03-0451-4000-B000-000000000000")
        val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805F9B34FB")
        private const val MAX_CHUNK_BYTES = 140
    }

    var onPeerDiscovered: ((peerId: String, name: String, deviceCode: String?, rssi: Int, connected: Boolean) -> Unit)? = null
    var onPeerLost: ((peerId: String) -> Unit)? = null
    var onConnectionRequest: ((peerId: String, peerName: String, deviceCode: String?) -> Unit)? = null
    var onConnectionStateChanged: ((peerId: String, peerName: String?, state: String, message: String?) -> Unit)? = null
    var onBluetoothStateChanged: ((enabled: Boolean, hardwarePoweredOn: Boolean, permissionState: String, discoverable: Boolean, message: String?) -> Unit)? = null
    var onPacketReceived: ((peerId: String, packetJson: String) -> Unit)? = null
    var onScanStateChanged: ((state: String, message: String?) -> Unit)? = null
    var onError: ((message: String) -> Unit)? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val adapter: BluetoothAdapter? get() = bluetoothManager.adapter

    private var localDeviceId: String = "FC-ANDROID"
    private var isUserBluetoothEnabled = false
    private var isScanning = false
    private var gattServer: BluetoothGattServer? = null
    private var rxServerCharacteristic: BluetoothGattCharacteristic? = null

    // Central role (outgoing connections to iPhone or Android GATT Servers)
    private val discoveredDevices = ConcurrentHashMap<String, BluetoothDevice>()
    private val connectedGatts = ConcurrentHashMap<String, BluetoothGatt>()
    private val remoteTxChars = ConcurrentHashMap<String, BluetoothGattCharacteristic>()
    private val manuallyDisconnected = ConcurrentHashMap.newKeySet<String>()

    // Peripheral role (incoming connections require explicit user Accept/Reject)
    private val pendingApprovalCentrals = ConcurrentHashMap<String, BluetoothDevice>()
    private val subscribedCentrals = ConcurrentHashMap<String, BluetoothDevice>()

    // FC1 chunk reassembly buffers
    private data class ChunkBuffer(val total: Int, val parts: MutableMap<Int, String>)
    private val chunkBuffers = ConcurrentHashMap<String, ChunkBuffer>()

    fun updateLocalIdentity(deviceId: String) {
        localDeviceId = deviceId
        if (isUserBluetoothEnabled) {
            startGattServerAndAdvertise()
        }
    }

    fun setBluetoothEnabled(enabled: Boolean) {
        isUserBluetoothEnabled = enabled
        val bt = adapter
        if (!enabled) {
            stopDiscovery()
            runCatching { bt?.bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback) }
            connectedGatts.keys.toList().forEach { disconnectPeer(it) }
            pendingApprovalCentrals.clear()
            subscribedCentrals.clear()
            emitBluetoothState("Bluetooth messaging disabled in FreeConnect Settings.")
            return
        }
        if (bt == null || !bt.isEnabled) {
            emitBluetoothState("Bluetooth adapter is turned off on this Android phone. Enable Bluetooth in Android Settings.")
            return
        }
        startGattServerAndAdvertise()
        emitBluetoothState("Android BLE GATT active and discoverable.")
    }

    fun emitBluetoothState(customMessage: String? = null) {
        val bt = adapter
        val hwOn = bt != null && bt.isEnabled
        val active = isUserBluetoothEnabled && hwOn
        val msg = customMessage ?: when {
            bt == null -> "No Bluetooth hardware adapter detected on this device."
            !hwOn -> "Bluetooth is disabled in Android system settings."
            active -> "Android BLE GATT active and ready for nearby discovery."
            else -> "Bluetooth is turned off in FreeConnect Settings."
        }
        onBluetoothStateChanged?.invoke(active, hwOn, "granted", active, msg)
    }

    fun respondToConnectionRequest(peerId: String, accept: Boolean) {
        val central = pendingApprovalCentrals.remove(peerId) ?: return
        if (accept) {
            subscribedCentrals[peerId] = central
            onConnectionStateChanged?.invoke(
                peerId,
                central.name ?: "Nearby BLE Peer",
                "connected",
                "Connection accepted over Native Android BLE."
            )
        } else {
            subscribedCentrals.remove(peerId)
            gattServer?.cancelConnection(central)
            onConnectionStateChanged?.invoke(
                peerId,
                central.name ?: "Nearby BLE Peer",
                "failed",
                "Connection Rejected."
            )
        }
    }

    fun startDiscovery() {
        if (!isUserBluetoothEnabled) {
            onError?.invoke("Turn Bluetooth ON in Settings before scanning for nearby devices.")
            return
        }
        val bt = adapter
        if (bt == null || !bt.isEnabled) {
            onError?.invoke("Bluetooth is turned off. Please enable Bluetooth in Android Settings.")
            emitBluetoothState()
            return
        }

        startGattServerAndAdvertise()

        val scanner = bt.bluetoothLeScanner
        if (scanner == null) {
            onError?.invoke("Bluetooth LE Scanner is unavailable on this Android device.")
            return
        }

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        isScanning = true
        onScanStateChanged?.invoke("searching", "Scanning nearby BLE devices (Android & iPhone)...")
        scanner.startScan(listOf(filter), settings, scanCallback)
    }

    fun stopDiscovery() {
        if (isScanning) {
            adapter?.bluetoothLeScanner?.stopScan(scanCallback)
            isScanning = false
        }
        onScanStateChanged?.invoke("idle", null)
    }

    fun connectPeer(peerId: String) {
        manuallyDisconnected.remove(peerId)
        val device = discoveredDevices[peerId]
        if (device == null) {
            onError?.invoke("BLE device $peerId is not currently discovered. Scan again first.")
            return
        }
        onConnectionStateChanged?.invoke(peerId, device.name, "connecting", "Connecting via Native Android BLE...")
        device.connectGatt(context, false, gattClientCallback, BluetoothDevice.TRANSPORT_LE)
    }

    fun disconnectPeer(peerId: String) {
        manuallyDisconnected.add(peerId)
        connectedGatts.remove(peerId)?.let { gatt ->
            gatt.disconnect()
            gatt.close()
        }
        remoteTxChars.remove(peerId)
        subscribedCentrals.remove(peerId)?.let { central ->
            gattServer?.cancelConnection(central)
        }
        onConnectionStateChanged?.invoke(peerId, null, "disconnected", "Disconnected by user.")
    }

    fun sendPacket(peerId: String, packetJson: String): Boolean {
        val frames = buildChunkFrames(packetJson)

        // Path A: We are Central connected to a remote Peripheral (iPhone or Android)
        val gatt = connectedGatts[peerId]
        val txChar = remoteTxChars[peerId]
        if (gatt != null && txChar != null) {
            for (frame in frames) {
                val bytes = frame.toByteArray(StandardCharsets.UTF_8)
                txChar.value = bytes
                txChar.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                if (!gatt.writeCharacteristic(txChar)) {
                    return false
                }
            }
            return true
        }

        // Path B: We are Peripheral sending notifications to a subscribed Central (iPhone or Android)
        val central = subscribedCentrals[peerId]
        val rxChar = rxServerCharacteristic
        if (central != null && rxChar != null && gattServer != null) {
            for (frame in frames) {
                rxChar.value = frame.toByteArray(StandardCharsets.UTF_8)
                gattServer?.notifyCharacteristicChanged(central, rxChar, false)
            }
            return true
        }

        return false
    }

    fun shutdown() {
        stopDiscovery()
        adapter?.bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
        connectedGatts.values.forEach { it.close() }
        connectedGatts.clear()
        remoteTxChars.clear()
        subscribedCentrals.clear()
        gattServer?.close()
        gattServer = null
    }

    // MARK: - BLE Peripheral GATT Server (accepts connections from iPhones & Androids)

    private fun startGattServerAndAdvertise() {
        val bt = adapter ?: return
        if (!bt.isEnabled) return

        if (gattServer == null) {
            gattServer = bluetoothManager.openGattServer(context, gattServerCallback)
            val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)

            val txChar = BluetoothGattCharacteristic(
                TX_CHAR_UUID,
                BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
                BluetoothGattCharacteristic.PERMISSION_WRITE
            )
            val rxChar = BluetoothGattCharacteristic(
                RX_CHAR_UUID,
                BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_READ,
                BluetoothGattCharacteristic.PERMISSION_READ
            )
            val cccd = BluetoothGattDescriptor(
                CCCD_UUID,
                BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
            )
            rxChar.addDescriptor(cccd)
            rxServerCharacteristic = rxChar

            service.addCharacteristic(txChar)
            service.addCharacteristic(rxChar)
            gattServer?.addService(service)
        }

        val advertiser = bt.bluetoothLeAdvertiser ?: return
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setConnectable(true)
            .setTimeout(0)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .build()

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()

        val scanResponse = AdvertiseData.Builder()
            .setIncludeDeviceName(true)
            .build()

        advertiser.stopAdvertising(advertiseCallback)
        advertiser.startAdvertising(settings, data, scanResponse, advertiseCallback)
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartFailure(errorCode: Int) {
            onError?.invoke("BLE Peripheral advertising failed (code $errorCode).")
        }
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device ?: return
            val address = device.address
            discoveredDevices[address] = device
            val name = result.scanRecord?.deviceName ?: device.name ?: "FreeConnect Peer"
            val deviceCode = if (name.startsWith("FC-")) name else null
            val connected = connectedGatts.containsKey(address) || subscribedCentrals.containsKey(address)
            onPeerDiscovered?.invoke(address, name, deviceCode, result.rssi, connected)
        }

        override fun onScanFailed(errorCode: Int) {
            isScanning = false
            onScanStateChanged?.invoke("idle", "BLE scan failed (code $errorCode).")
            onError?.invoke("Android BLE scan failed with error code $errorCode.")
        }
    }

    private val gattClientCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            val address = gatt.device.address
            val name = gatt.device.name
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                connectedGatts[address] = gatt
                // Request larger ATT MTU so 140-byte FC1 chunks fit in a single BLE PDU
                gatt.requestMtu(247)
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                connectedGatts.remove(address)
                remoteTxChars.remove(address)
                gatt.close()

                val wasManual = manuallyDisconnected.contains(address)
                onConnectionStateChanged?.invoke(
                    address,
                    name,
                    "disconnected",
                    if (wasManual) "Disconnected." else "BLE link dropped. Attempting automatic reconnect..."
                )

                if (!wasManual) {
                    mainHandler.postDelayed({
                        if (!manuallyDisconnected.contains(address)) {
                            connectPeer(address)
                        }
                    }, 2500L)
                }
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            gatt.discoverServices()
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) return
            val service = gatt.getService(SERVICE_UUID) ?: return
            val tx = service.getCharacteristic(TX_CHAR_UUID)
            val rx = service.getCharacteristic(RX_CHAR_UUID)
            val address = gatt.device.address

            if (tx != null) {
                remoteTxChars[address] = tx
            }
            if (rx != null) {
                gatt.setCharacteristicNotification(rx, true)
                val cccd = rx.getDescriptor(CCCD_UUID)
                if (cccd != null) {
                    cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    gatt.writeDescriptor(cccd)
                }
            }

            if (tx != null) {
                onConnectionStateChanged?.invoke(
                    address,
                    gatt.device.name,
                    "connected",
                    "Connected via Native Android BLE."
                )
            }
        }

        @Deprecated("Deprecated in API 33")
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (characteristic.uuid == RX_CHAR_UUID) {
                val bytes = characteristic.value ?: return
                handleIncomingBytes(bytes, gatt.device.address)
            }
        }
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            val address = device.address
            if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                pendingApprovalCentrals.remove(address)
                val wasApproved = subscribedCentrals.remove(address) != null
                if (wasApproved) {
                    onConnectionStateChanged?.invoke(address, device.name, "disconnected", "Remote BLE peer disconnected.")
                }
                onPeerLost?.invoke(address)
            }
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            descriptor: BluetoothGattDescriptor,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            if (descriptor.uuid == CCCD_UUID) {
                val enable = value?.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == true
                if (enable && isUserBluetoothEnabled) {
                    if (!subscribedCentrals.containsKey(device.address)) {
                        // Security: require explicit approval from receiving user before accepting link
                        pendingApprovalCentrals[device.address] = device
                        onConnectionRequest?.invoke(
                            device.address,
                            device.name ?: "Nearby BLE Device",
                            null
                        )
                    }
                } else {
                    pendingApprovalCentrals.remove(device.address)
                    subscribedCentrals.remove(device.address)
                }
            }
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
            }
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            if (!subscribedCentrals.containsKey(device.address)) {
                if (responseNeeded) {
                    gattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_INSUFFICIENT_AUTHENTICATION,
                        0,
                        null
                    )
                }
                return
            }
            if (characteristic.uuid == TX_CHAR_UUID && value != null) {
                handleIncomingBytes(value, device.address)
            }
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
            }
        }
    }

    // MARK: - FC1 Chunk Framing & Reassembly (matches iOS Swift & Web TypeScript)

    private fun buildChunkFrames(packetJson: String): List<String> {
        val packetId = UUID.randomUUID().toString().substring(0, 8)
        val utf8 = packetJson.toByteArray(StandardCharsets.UTF_8)
        val slices = mutableListOf<String>()
        var offset = 0

        while (offset < utf8.size) {
            var end = minOf(offset + MAX_CHUNK_BYTES, utf8.size)
            while (end < utf8.size && (utf8[end].toInt() and 0xC0) == 0x80) {
                end--
            }
            if (end <= offset) end = minOf(offset + MAX_CHUNK_BYTES, utf8.size)
            slices.add(String(utf8, offset, end - offset, StandardCharsets.UTF_8))
            offset = end
        }
        if (slices.isEmpty()) slices.add("")

        val total = slices.size
        return slices.mapIndexed { idx, slice -> "FC1|$packetId|${idx + 1}/$total|$slice" }
    }

    private fun handleIncomingBytes(bytes: ByteArray, peerId: String) {
        val text = String(bytes, StandardCharsets.UTF_8)
        if (!text.startsWith("FC1|")) {
            onPacketReceived?.invoke(peerId, text)
            return
        }

        val parts = text.split("|", limit = 4)
        if (parts.size != 4) return
        val packetId = parts[1]
        val seqParts = parts[2].split("/")
        if (seqParts.size != 2) return
        val seq = seqParts[0].toIntOrNull() ?: return
        val total = seqParts[1].toIntOrNull() ?: return
        val payloadSlice = parts[3]

        val key = "$peerId:$packetId"
        val buf = chunkBuffers.computeIfAbsent(key) { ChunkBuffer(total, mutableMapOf()) }
        synchronized(buf) {
            buf.parts[seq] = payloadSlice
            if (buf.parts.size >= buf.total) {
                val sb = StringBuilder()
                for (i in 1..buf.total) {
                    sb.append(buf.parts[i] ?: return)
                }
                chunkBuffers.remove(key)
                onPacketReceived?.invoke(peerId, sb.toString())
            }
        }
    }
}
