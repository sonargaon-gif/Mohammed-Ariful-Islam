package com.freeconnect.app

import android.app.Application
import com.freeconnect.app.bluetooth.BleDiscoveryManager
import com.freeconnect.app.bluetooth.BluetoothClassicManager
import com.freeconnect.app.crypto.CryptoManager
import com.freeconnect.app.data.db.FreeConnectDatabase
import com.freeconnect.app.data.repository.FreeConnectRepository
import com.freeconnect.app.mesh.MeshRelayEngine

class FreeConnectApp : Application() {

    lateinit var database: FreeConnectDatabase
        private set
    lateinit var cryptoManager: CryptoManager
        private set
    lateinit var repository: FreeConnectRepository
        private set
    lateinit var bleDiscoveryManager: BleDiscoveryManager
        private set
    lateinit var meshRelayEngine: MeshRelayEngine
        private set
    lateinit var bluetoothClassicManager: BluetoothClassicManager
        private set

    override fun onCreate() {
        super.onCreate()
        database = FreeConnectDatabase.getInstance(this)
        cryptoManager = CryptoManager(this)
        repository = FreeConnectRepository(this, database, cryptoManager)
        bleDiscoveryManager = BleDiscoveryManager(this)
        meshRelayEngine = MeshRelayEngine(database, repository, cryptoManager)
        bluetoothClassicManager = BluetoothClassicManager(
            context = this,
            cryptoManager = cryptoManager,
            repository = repository,
            bleDiscoveryManager = bleDiscoveryManager,
            meshRelayEngine = meshRelayEngine
        )
    }
}
