package com.freeconnect.app.bluetooth

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import com.freeconnect.app.data.repository.BatteryProfile
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class DiscoveredDevice(
    val address: String,
    val name: String,
    val rssi: Int,
    val isFreeConnectBeacon: Boolean,
    val isBonded: Boolean,
    val advertisedNodeTag: String?,
    val lastSeenAt: Long = System.currentTimeMillis()
)

/**
 * Low-energy BLE discovery & advertising manager.
 * Advertises the FreeConnect 128-bit Service UUID so nearby Android phones running FreeConnect
 * can identify each other without draining battery via continuous Classic inquiry scans.
 * Actual encrypted messaging streams run over Bluetooth Classic RFCOMM sockets.
 */
class BleDiscoveryManager(private val context: Context) {

    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val adapter: BluetoothAdapter? get() = bluetoothManager?.adapter

    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning.asStateFlow()

    private val _isAdvertising = MutableStateFlow(false)
    val isAdvertising: StateFlow<Boolean> = _isAdvertising.asStateFlow()

    private val _discoveredDevices = MutableStateFlow<Map<String, DiscoveredDevice>>(emptyMap())
    val discoveredDevices: StateFlow<Map<String, DiscoveredDevice>> = _discoveredDevices.asStateFlow()

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device ?: return
            val address = device.address ?: return
            val serviceData = result.scanRecord?.getServiceData(
                ParcelUuid(BluetoothConstants.BLE_DISCOVERY_SERVICE_UUID)
            )
            val nodeTag = serviceData?.let { String(it, Charsets.UTF_8) }
            val displayName = result.scanRecord?.deviceName
                ?: device.name
                ?: nodeTag
                ?: "FreeConnect Peer"

            val entry = DiscoveredDevice(
                address = address,
                name = displayName,
                rssi = result.rssi,
                isFreeConnectBeacon = true,
                isBonded = device.bondState == android.bluetooth.BluetoothDevice.BOND_BONDED,
                advertisedNodeTag = nodeTag,
                lastSeenAt = System.currentTimeMillis()
            )
            _discoveredDevices.value = _discoveredDevices.value + (address to entry)
        }

        override fun onScanFailed(errorCode: Int) {
            _isScanning.value = false
            _lastError.value = "BLE scan failed (code $errorCode). Classic discovery remains available."
            Log.e(TAG, "BLE scan failed with code $errorCode")
        }
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            _isAdvertising.value = true
            _lastError.value = null
            Log.i(TAG, "BLE advertising started for FreeConnect UUID")
        }

        override fun onStartFailure(errorCode: Int) {
            _isAdvertising.value = false
            _lastError.value = when (errorCode) {
                ADVERTISE_FAILED_FEATURE_UNSUPPORTED ->
                    "BLE peripheral advertising unsupported on this chipset. Use Bluetooth Classic discovery."
                ADVERTISE_FAILED_TOO_MANY_ADVERTISERS ->
                    "Too many BLE advertisers active. Falling back to Classic RFCOMM listener."
                else -> "BLE advertising error (code $errorCode)"
            }
            Log.w(TAG, "BLE advertise failed: $errorCode")
        }
    }

    @SuppressLint("MissingPermission")
    fun startAdvertising(localNodeId: String, batteryProfile: BatteryProfile) {
        if (!BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) {
            _lastError.value = "Missing Bluetooth runtime permissions."
            return
        }
        val btAdapter = adapter ?: return
        if (!btAdapter.isEnabled || !btAdapter.isMultipleAdvertisementSupported) {
            _lastError.value = "BLE advertising unavailable on this device; RFCOMM listener active."
            return
        }
        val advertiser = btAdapter.bluetoothLeAdvertiser ?: return
        stopAdvertising()

        val mode = when (batteryProfile) {
            BatteryProfile.LOW_POWER -> AdvertiseSettings.ADVERTISE_MODE_LOW_POWER
            BatteryProfile.BALANCED -> AdvertiseSettings.ADVERTISE_MODE_BALANCED
            BatteryProfile.HIGH_RESPONSIVENESS -> AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY
        }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(mode)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(false)
            .build()

        val uuidParcel = ParcelUuid(BluetoothConstants.BLE_DISCOVERY_SERVICE_UUID)
        val tagBytes = localNodeId.take(8).toByteArray(Charsets.UTF_8)

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceUuid(uuidParcel)
            .addServiceData(uuidParcel, tagBytes)
            .build()

        runCatching {
            advertiser.startAdvertising(settings, data, advertiseCallback)
        }.onFailure {
            _lastError.value = "Failed to start BLE beacon: ${it.message}"
        }
    }

    @SuppressLint("MissingPermission")
    fun stopAdvertising() {
        if (!BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) return
        runCatching {
            adapter?.bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
        }
        _isAdvertising.value = false
    }

    @SuppressLint("MissingPermission")
    fun startScanning(batteryProfile: BatteryProfile) {
        if (!BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) {
            _lastError.value = "Grant Bluetooth permissions before scanning."
            return
        }
        val btAdapter = adapter
        if (btAdapter == null || !btAdapter.isEnabled) {
            _lastError.value = "Bluetooth is turned off. Enable Bluetooth to discover peers."
            return
        }
        val scanner = btAdapter.bluetoothLeScanner ?: return
        stopScanning()

        val scanMode = when (batteryProfile) {
            BatteryProfile.LOW_POWER -> ScanSettings.SCAN_MODE_LOW_POWER
            BatteryProfile.BALANCED -> ScanSettings.SCAN_MODE_BALANCED
            BatteryProfile.HIGH_RESPONSIVENESS -> ScanSettings.SCAN_MODE_LOW_LATENCY
        }

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(BluetoothConstants.BLE_DISCOVERY_SERVICE_UUID))
            .build()

        val settings = ScanSettings.Builder()
            .setScanMode(scanMode)
            .build()

        runCatching {
            scanner.startScan(listOf(filter), settings, scanCallback)
            _isScanning.value = true
            _lastError.value = null
        }.onFailure {
            _isScanning.value = false
            _lastError.value = "BLE scan error: ${it.message}"
        }
    }

    @SuppressLint("MissingPermission")
    fun stopScanning() {
        if (!BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) return
        runCatching {
            adapter?.bluetoothLeScanner?.stopScan(scanCallback)
        }
        _isScanning.value = false
    }

    fun mergeClassicDevice(device: DiscoveredDevice) {
        val current = _discoveredDevices.value[device.address]
        val merged = if (current != null && current.isFreeConnectBeacon) {
            current.copy(
                name = if (device.name.isNotBlank()) device.name else current.name,
                isBonded = device.isBonded,
                rssi = device.rssi,
                lastSeenAt = System.currentTimeMillis()
            )
        } else {
            device
        }
        _discoveredDevices.value = _discoveredDevices.value + (device.address to merged)
    }

    companion object {
        private const val TAG = "FreeConnectBle"
    }
}
