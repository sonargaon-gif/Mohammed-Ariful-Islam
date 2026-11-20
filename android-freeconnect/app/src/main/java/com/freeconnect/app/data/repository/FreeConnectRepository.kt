package com.freeconnect.app.data.repository

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.freeconnect.app.crypto.CryptoManager
import com.freeconnect.app.data.db.FreeConnectDatabase
import com.freeconnect.app.data.db.LocalProfileEntity
import com.freeconnect.app.data.db.MessageEntity
import com.freeconnect.app.data.db.MessageStatus
import com.freeconnect.app.data.db.PeerEntity
import com.freeconnect.app.data.db.QueuedPacketEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore by preferencesDataStore(name = "freeconnect_settings")

enum class BatteryProfile {
    LOW_POWER,
    BALANCED,
    HIGH_RESPONSIVENESS
}

data class AppSettings(
    val relayEnabled: Boolean = true,
    val maxHopTtl: Int = 4,
    val messageExpiryHours: Int = 24,
    val autoReconnect: Boolean = true,
    val bleDiscoveryEnabled: Boolean = true,
    val batteryProfile: BatteryProfile = BatteryProfile.BALANCED
)

class FreeConnectRepository(
    private val context: Context,
    private val database: FreeConnectDatabase,
    private val cryptoManager: CryptoManager
) {
    private val profileDao = database.localProfileDao()
    private val peerDao = database.peerDao()
    private val messageDao = database.messageDao()
    private val queueDao = database.queuedPacketDao()
    private val seenDao = database.seenPacketDao()

    val localProfile: Flow<LocalProfileEntity?> = profileDao.observeProfile()
    val peers: Flow<List<PeerEntity>> = peerDao.observeAllPeers()
    val allMessages: Flow<List<MessageEntity>> = messageDao.observeAllMessages()
    val queuedPackets: Flow<List<QueuedPacketEntity>> = queueDao.observeAllQueuedPackets()
    val seenPacketCount: Flow<Int> = seenDao.observeSeenCount()

    val settings: Flow<AppSettings> = context.settingsDataStore.data.map { prefs ->
        AppSettings(
            relayEnabled = prefs[KEY_RELAY_ENABLED] ?: true,
            maxHopTtl = prefs[KEY_MAX_TTL] ?: 4,
            messageExpiryHours = prefs[KEY_EXPIRY_HOURS] ?: 24,
            autoReconnect = prefs[KEY_AUTO_RECONNECT] ?: true,
            bleDiscoveryEnabled = prefs[KEY_BLE_DISCOVERY] ?: true,
            batteryProfile = runCatching {
                BatteryProfile.valueOf(prefs[KEY_BATTERY_PROFILE] ?: BatteryProfile.BALANCED.name)
            }.getOrDefault(BatteryProfile.BALANCED)
        )
    }

    suspend fun ensureLocalProfile(defaultName: String = "FreeConnect User"): LocalProfileEntity {
        val existing = profileDao.getProfile()
        if (existing != null) return existing
        val created = LocalProfileEntity(
            id = 1,
            nodeId = cryptoManager.getLocalNodeId(),
            displayName = defaultName,
            avatarColorIndex = 0,
            onboardingCompleted = false
        )
        profileDao.upsertProfile(created)
        return created
    }

    suspend fun updateProfile(
        displayName: String,
        avatarColorIndex: Int,
        statusNote: String,
        onboardingCompleted: Boolean = true
    ) {
        val current = ensureLocalProfile(displayName)
        profileDao.upsertProfile(
            current.copy(
                displayName = displayName.trim().ifBlank { current.displayName },
                avatarColorIndex = avatarColorIndex,
                statusNote = statusNote.trim(),
                onboardingCompleted = onboardingCompleted
            )
        )
    }

    suspend fun regenerateIdentity(): LocalProfileEntity {
        cryptoManager.regenerateIdentityKeyPair()
        val current = ensureLocalProfile()
        val updated = current.copy(nodeId = cryptoManager.getLocalNodeId())
        profileDao.upsertProfile(updated)
        return updated
    }

    fun observeConversation(peerNodeId: String): Flow<List<MessageEntity>> =
        messageDao.observeConversation(peerNodeId)

    suspend fun getPeer(nodeId: String): PeerEntity? = peerDao.getPeerByNodeId(nodeId)

    suspend fun upsertPeer(peer: PeerEntity) = peerDao.upsertPeer(peer)

    suspend fun updatePeerConnected(nodeId: String, connected: Boolean) =
        peerDao.updateConnectionStatus(nodeId, connected)

    suspend fun markAllPeersDisconnected() = peerDao.markAllDisconnected()

    suspend fun insertMessage(message: MessageEntity) = messageDao.insertMessage(message)

    suspend fun updateMessageDelivery(
        messageId: String,
        status: MessageStatus,
        hopCount: Int,
        routeTrace: String
    ) = messageDao.updateMessageDelivery(messageId, status, hopCount, routeTrace)

    suspend fun updateMessageStatus(messageId: String, status: MessageStatus) =
        messageDao.updateStatus(messageId, status)

    suspend fun deleteConversation(peerNodeId: String) = messageDao.deleteConversation(peerNodeId)

    suspend fun updateSettings(transform: (AppSettings) -> AppSettings) {
        context.settingsDataStore.edit { prefs ->
            val current = AppSettings(
                relayEnabled = prefs[KEY_RELAY_ENABLED] ?: true,
                maxHopTtl = prefs[KEY_MAX_TTL] ?: 4,
                messageExpiryHours = prefs[KEY_EXPIRY_HOURS] ?: 24,
                autoReconnect = prefs[KEY_AUTO_RECONNECT] ?: true,
                bleDiscoveryEnabled = prefs[KEY_BLE_DISCOVERY] ?: true,
                batteryProfile = runCatching {
                    BatteryProfile.valueOf(prefs[KEY_BATTERY_PROFILE] ?: BatteryProfile.BALANCED.name)
                }.getOrDefault(BatteryProfile.BALANCED)
            )
            val updated = transform(current)
            prefs[KEY_RELAY_ENABLED] = updated.relayEnabled
            prefs[KEY_MAX_TTL] = updated.maxHopTtl.coerceIn(1, 6)
            prefs[KEY_EXPIRY_HOURS] = updated.messageExpiryHours.coerceIn(1, 168)
            prefs[KEY_AUTO_RECONNECT] = updated.autoReconnect
            prefs[KEY_BLE_DISCOVERY] = updated.bleDiscoveryEnabled
            prefs[KEY_BATTERY_PROFILE] = updated.batteryProfile.name
            prefs[KEY_UPDATED_AT] = System.currentTimeMillis()
        }
    }

    /**
     * Permanently deletes all local conversations, queued relay packets, and seen cache.
     * Local identity profile is preserved unless user explicitly regenerates keys.
     */
    suspend fun deleteAllChatData() {
        messageDao.deleteAllMessages()
        queueDao.deleteAll()
        seenDao.deleteAll()
    }

    companion object {
        private val KEY_RELAY_ENABLED = booleanPreferencesKey("relay_enabled")
        private val KEY_MAX_TTL = intPreferencesKey("max_ttl")
        private val KEY_EXPIRY_HOURS = intPreferencesKey("expiry_hours")
        private val KEY_AUTO_RECONNECT = booleanPreferencesKey("auto_reconnect")
        private val KEY_BLE_DISCOVERY = booleanPreferencesKey("ble_discovery")
        private val KEY_BATTERY_PROFILE = stringPreferencesKey("battery_profile")
        private val KEY_UPDATED_AT = longPreferencesKey("updated_at")
    }
}
