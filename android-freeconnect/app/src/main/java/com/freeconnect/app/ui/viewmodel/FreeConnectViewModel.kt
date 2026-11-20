package com.freeconnect.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.freeconnect.app.FreeConnectApp
import com.freeconnect.app.bluetooth.ActiveLinkInfo
import com.freeconnect.app.bluetooth.BluetoothForegroundService
import com.freeconnect.app.bluetooth.BluetoothPermissionHelper
import com.freeconnect.app.bluetooth.DiscoveredDevice
import com.freeconnect.app.data.db.LocalProfileEntity
import com.freeconnect.app.data.db.MessageEntity
import com.freeconnect.app.data.db.PeerEntity
import com.freeconnect.app.data.db.QueuedPacketEntity
import com.freeconnect.app.data.repository.AppSettings
import com.freeconnect.app.data.repository.BatteryProfile
import com.freeconnect.app.mesh.MeshRelayEngine
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class FreeConnectViewModel(private val app: FreeConnectApp) : ViewModel() {

    val localProfile: StateFlow<LocalProfileEntity?> = app.repository.localProfile
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val peers: StateFlow<List<PeerEntity>> = app.repository.peers
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val allMessages: StateFlow<List<MessageEntity>> = app.repository.allMessages
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val queuedPackets: StateFlow<List<QueuedPacketEntity>> = app.repository.queuedPackets
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val seenPacketCount: StateFlow<Int> = app.repository.seenPacketCount
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val settings: StateFlow<AppSettings> = app.repository.settings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppSettings())

    val discoveredDevices: StateFlow<Map<String, DiscoveredDevice>> =
        app.bleDiscoveryManager.discoveredDevices

    val isBleScanning: StateFlow<Boolean> = app.bleDiscoveryManager.isScanning
    val isBleAdvertising: StateFlow<Boolean> = app.bleDiscoveryManager.isAdvertising
    val bleError: StateFlow<String?> = app.bleDiscoveryManager.lastError

    val isBluetoothEnabled: StateFlow<Boolean> = app.bluetoothClassicManager.isBluetoothEnabled
    val isClassicDiscovering: StateFlow<Boolean> = app.bluetoothClassicManager.isClassicDiscovering
    val activeLinks: StateFlow<Map<String, ActiveLinkInfo>> = app.bluetoothClassicManager.activeLinks
    val connectionError: StateFlow<String?> = app.bluetoothClassicManager.connectionError

    val relayStats: StateFlow<MeshRelayEngine.RelayStats> = app.meshRelayEngine.stats

    init {
        viewModelScope.launch {
            app.repository.ensureLocalProfile()
        }
    }

    fun hasPermissions(): Boolean = BluetoothPermissionHelper.hasAllBluetoothPermissions(app)

    fun getLocalFingerprint(): String = app.cryptoManager.getLocalFingerprint()

    fun startOfflineBluetoothServices() {
        if (!hasPermissions()) return
        BluetoothForegroundService.start(app)
        app.bluetoothClassicManager.startServerListener()
        app.bluetoothClassicManager.loadBondedDevices()
    }

    fun startScanningNearby() {
        if (!hasPermissions()) return
        viewModelScope.launch {
            val currentSettings = app.repository.settings.first()
            app.bluetoothClassicManager.startClassicDiscovery()
            if (currentSettings.bleDiscoveryEnabled) {
                app.bleDiscoveryManager.startScanning(currentSettings.batteryProfile)
                app.bleDiscoveryManager.startAdvertising(
                    localNodeId = app.cryptoManager.getLocalNodeId(),
                    batteryProfile = currentSettings.batteryProfile
                )
            }
        }
    }

    fun stopScanningNearby() {
        app.bluetoothClassicManager.stopClassicDiscovery()
        app.bleDiscoveryManager.stopScanning()
    }

    fun pairDevice(address: String) = app.bluetoothClassicManager.pairDevice(address)

    fun connectToDevice(address: String) = app.bluetoothClassicManager.connectToDevice(address)

    fun disconnectDevice(address: String) = app.bluetoothClassicManager.disconnectDevice(address)

    fun observeConversation(peerNodeId: String): Flow<List<MessageEntity>> =
        app.repository.observeConversation(peerNodeId)

    fun sendMessage(peerNodeId: String, text: String) {
        val clean = text.trim()
        if (clean.isEmpty()) return
        viewModelScope.launch {
            app.meshRelayEngine.sendEncryptedMessage(peerNodeId, clean)
        }
    }

    fun flushQueueNow() {
        viewModelScope.launch {
            app.meshRelayEngine.flushAllQueuedPackets()
        }
    }

    fun deleteConversation(peerNodeId: String) {
        viewModelScope.launch {
            app.repository.deleteConversation(peerNodeId)
        }
    }

    fun saveProfile(displayName: String, avatarColorIndex: Int, statusNote: String) {
        viewModelScope.launch {
            app.repository.updateProfile(
                displayName = displayName,
                avatarColorIndex = avatarColorIndex,
                statusNote = statusNote,
                onboardingCompleted = true
            )
        }
    }

    fun regenerateIdentityKeys() {
        viewModelScope.launch {
            app.repository.regenerateIdentity()
        }
    }

    fun updateRelayEnabled(enabled: Boolean) {
        viewModelScope.launch {
            app.repository.updateSettings { it.copy(relayEnabled = enabled) }
        }
    }

    fun updateMaxHopTtl(ttl: Int) {
        viewModelScope.launch {
            app.repository.updateSettings { it.copy(maxHopTtl = ttl) }
        }
    }

    fun updateExpiryHours(hours: Int) {
        viewModelScope.launch {
            app.repository.updateSettings { it.copy(messageExpiryHours = hours) }
        }
    }

    fun updateAutoReconnect(enabled: Boolean) {
        viewModelScope.launch {
            app.repository.updateSettings { it.copy(autoReconnect = enabled) }
        }
    }

    fun updateBatteryProfile(profile: BatteryProfile) {
        viewModelScope.launch {
            app.repository.updateSettings { it.copy(batteryProfile = profile) }
        }
    }

    fun deleteAllLocalChatData() {
        viewModelScope.launch {
            app.repository.deleteAllChatData()
        }
    }

    fun clearConnectionError() = app.bluetoothClassicManager.clearError()

    class Factory(private val app: FreeConnectApp) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return FreeConnectViewModel(app) as T
        }
    }
}
