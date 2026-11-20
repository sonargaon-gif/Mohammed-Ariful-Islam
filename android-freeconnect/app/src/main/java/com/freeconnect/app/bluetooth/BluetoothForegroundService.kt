package com.freeconnect.app.bluetooth

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.freeconnect.app.FreeConnectApp
import com.freeconnect.app.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Android 14+ compliant Foreground Service (foregroundServiceType="connectedDevice").
 * Keeps Bluetooth Classic RFCOMM sockets and BLE discovery running reliably when the user
 * switches apps or locks the screen, while respecting Android background execution limits.
 */
class BluetoothForegroundService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopMeshService()
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = buildNotification("Offline Bluetooth listener active · 0 peers connected")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        val app = application as FreeConnectApp
        if (BluetoothPermissionHelper.hasAllBluetoothPermissions(this)) {
            app.bluetoothClassicManager.startServerListener()
            app.bluetoothClassicManager.loadBondedDevices()

            serviceScope.launch {
                val settings = app.repository.settings.first()
                if (settings.bleDiscoveryEnabled) {
                    app.bleDiscoveryManager.startAdvertising(
                        localNodeId = app.cryptoManager.getLocalNodeId(),
                        batteryProfile = settings.batteryProfile
                    )
                }
            }

            serviceScope.launch {
                app.bluetoothClassicManager.activeLinks.collect { links ->
                    val connectedCount = links.values.count {
                        it.state == com.freeconnect.app.data.db.ConnectionState.CONNECTED
                    }
                    val manager = getSystemService(NotificationManager::class.java)
                    manager.notify(
                        NOTIFICATION_ID,
                        buildNotification("Offline Bluetooth active · $connectedCount connected peers")
                    )
                }
            }
        }

        return START_STICKY
    }

    private fun stopMeshService() {
        val app = application as FreeConnectApp
        app.bleDiscoveryManager.stopScanning()
        app.bleDiscoveryManager.stopAdvertising()
        app.bluetoothClassicManager.stopAllConnections("Service stopped")
    }

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "FreeConnect Bluetooth Relay",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Maintains local Bluetooth sockets and encrypted mesh relay."
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(statusText: String): Notification {
        val launchIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("FreeConnect Offline Mesh")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "freeconnect_bt_relay_channel"
        private const val NOTIFICATION_ID = 1042
        const val ACTION_START = "com.freeconnect.app.action.START"
        const val ACTION_STOP = "com.freeconnect.app.action.STOP"

        fun start(context: Context) {
            val intent = Intent(context, BluetoothForegroundService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, BluetoothForegroundService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }
}
