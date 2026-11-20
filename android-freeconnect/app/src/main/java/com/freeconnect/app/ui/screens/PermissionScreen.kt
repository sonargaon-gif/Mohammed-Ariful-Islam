package com.freeconnect.app.ui.screens

import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.freeconnect.app.bluetooth.BluetoothPermissionHelper
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.components.GlowingPrimaryButton
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.SignalGreen
import com.freeconnect.app.ui.theme.TextMuted
import com.freeconnect.app.ui.theme.TextWhite

@Composable
fun PermissionScreen(onAllGranted: () -> Unit) {
    val context = LocalContext.current
    val requiredPerms = remember { BluetoothPermissionHelper.requiredPermissions() }
    var refreshTick by remember { mutableIntStateOf(0) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) {
        refreshTick++
        if (BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) {
            onAllGranted()
        }
    }

    val enableBtLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) {
        refreshTick++
    }

    val allGranted = remember(refreshTick) {
        BluetoothPermissionHelper.hasAllBluetoothPermissions(context)
    }

    FuturisticBackground(scrimAlpha = 0.72f) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp, vertical = 48.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text("Bluetooth Permissions", style = MaterialTheme.typography.headlineLarge)
                Spacer(Modifier.height(8.dp))
                Text(
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        "Android 12+ requires Nearby Devices permissions for Bluetooth scanning, RFCOMM connections, and BLE discovery. Zero internet permissions are used."
                    } else {
                        "Android ${Build.VERSION.RELEASE} requires Bluetooth and Location permissions strictly for hardware Bluetooth discovery. No location data is stored."
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = TextMuted
                )

                Spacer(Modifier.height(22.dp))

                GlassCard(highlighted = allGranted) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        requiredPerms.forEach { perm ->
                            val granted = remember(refreshTick) {
                                BluetoothPermissionHelper.isPermissionGranted(context, perm)
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(perm.substringAfterLast('.'), style = MaterialTheme.typography.titleMedium)
                                    Text(describePermission(perm), style = MaterialTheme.typography.bodyMedium)
                                }
                                Icon(
                                    imageVector = if (granted) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked,
                                    contentDescription = null,
                                    tint = if (granted) SignalGreen else CyanGlow.copy(alpha = 0.45f)
                                )
                            }
                        }
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(
                    onClick = {
                        enableBtLauncher.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
                    },
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text("Turn On Bluetooth Radio", color = TextWhite)
                }

                GlowingPrimaryButton(
                    text = if (allGranted) "ENTER FREECONNECT" else "GRANT BLUETOOTH PERMISSIONS",
                    onClick = {
                        if (allGranted) onAllGranted()
                        else permissionLauncher.launch(requiredPerms.toTypedArray())
                    }
                )
            }
        }
    }
}

private fun describePermission(permission: String): String = when {
    permission.endsWith("BLUETOOTH_SCAN") -> "Discover nearby FreeConnect users via BLE & Classic"
    permission.endsWith("BLUETOOTH_CONNECT") -> "Open encrypted RFCOMM peer sockets & bond devices"
    permission.endsWith("BLUETOOTH_ADVERTISE") -> "Broadcast FreeConnect BLE presence to nearby phones"
    permission.endsWith("POST_NOTIFICATIONS") -> "Show persistent offline Bluetooth service status"
    permission.endsWith("ACCESS_FINE_LOCATION") -> "Required by Android 8–11 for Bluetooth radio scans"
    else -> "Required for offline Bluetooth communication"
}
