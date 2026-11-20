package com.freeconnect.app.bluetooth

import java.util.UUID

object BluetoothConstants {
    // Custom 128-bit RFCOMM SPP UUID for FreeConnect peer-to-peer sockets
    const val RFCOMM_SERVICE_NAME = "FreeConnectOfflineMesh"
    val RFCOMM_SERVICE_UUID: UUID = UUID.fromString("6f8a2c40-5b1e-4d9a-9c3f-7e2a1b4c8d01")

    // Custom 128-bit BLE Service UUID advertised so nearby FreeConnect phones detect each other fast
    val BLE_DISCOVERY_SERVICE_UUID: UUID = UUID.fromString("6f8a2c40-5b1e-4d9a-9c3f-7e2a1b4c8d02")

    // Maximum allowed single framed JSON packet size (256 KB) to guard against malformed streams
    const val MAX_FRAME_BYTES = 262_144

    // Maximum practical concurrent RFCOMM connections on most Android Bluetooth chipsets
    const val MAX_CONCURRENT_RFCOMM_PEERS = 5

    // Reconnection backoff bounds
    const val RECONNECT_INITIAL_DELAY_MS = 3_000L
    const val RECONNECT_MAX_DELAY_MS = 60_000L
}
