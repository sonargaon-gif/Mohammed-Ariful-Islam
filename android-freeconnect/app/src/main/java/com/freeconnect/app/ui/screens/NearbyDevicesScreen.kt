package com.freeconnect.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.BluetoothSearching
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.freeconnect.app.data.db.ConnectionState
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.ElectricBlue
import com.freeconnect.app.ui.theme.ErrorCrimson
import com.freeconnect.app.ui.theme.FreeConnectSurface
import com.freeconnect.app.ui.theme.SignalGreen
import com.freeconnect.app.ui.theme.TextWhite
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NearbyDevicesScreen(
    viewModel: FreeConnectViewModel,
    onBack: () -> Unit,
    onOpenConnections: () -> Unit,
    onOpenChat: (String) -> Unit
) {
    val discovered by viewModel.discoveredDevices.collectAsState()
    val isBleScanning by viewModel.isBleScanning.collectAsState()
    val isClassicDiscovering by viewModel.isClassicDiscovering.collectAsState()
    val activeLinks by viewModel.activeLinks.collectAsState()
    val connectionError by viewModel.connectionError.collectAsState()

    val isScanning = isBleScanning || isClassicDiscovering

    DisposableEffect(Unit) {
        viewModel.startScanningNearby()
        onDispose { viewModel.stopScanningNearby() }
    }

    FuturisticBackground(scrimAlpha = 0.74f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = { Text("Nearby Bluetooth Devices", style = MaterialTheme.typography.headlineMedium) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = TextWhite)
                        }
                    },
                    actions = {
                        OutlinedButton(onClick = onOpenConnections) {
                            Text("Links", color = CyanGlow)
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = FreeConnectSurface)
                )
            }
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp)
            ) {
                GlassCard(highlighted = isScanning, padding = 14.dp) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                if (isScanning) "Active BLE + Classic Scan" else "Discovery Paused",
                                style = MaterialTheme.typography.titleMedium
                            )
                            Text(
                                "Searching for FreeConnect Service UUID beacons",
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                        Button(
                            onClick = {
                                if (isScanning) viewModel.stopScanningNearby()
                                else viewModel.startScanningNearby()
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue)
                        ) {
                            Icon(Icons.Rounded.BluetoothSearching, contentDescription = null)
                            Text(if (isScanning) " Stop" else " Scan")
                        }
                    }
                }

                if (connectionError != null) {
                    Spacer(Modifier.height(10.dp))
                    Text(connectionError!!, color = ErrorCrimson, style = MaterialTheme.typography.bodyMedium)
                }

                Spacer(Modifier.height(14.dp))

                val sortedDevices = discovered.values.sortedWith(
                    compareByDescending<com.freeconnect.app.bluetooth.DiscoveredDevice> { it.isFreeConnectBeacon }
                        .thenByDescending { it.isBonded }
                        .thenByDescending { it.rssi }
                )

                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(sortedDevices, key = { it.address }) { device ->
                        val link = activeLinks[device.address]
                        GlassCard(highlighted = device.isFreeConnectBeacon, padding = 14.dp) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(device.name, style = MaterialTheme.typography.titleMedium)
                                    Text(
                                        "${device.address} · ${device.rssi} dBm · " +
                                            (if (device.isFreeConnectBeacon) "FreeConnect Beacon" else "Classic BT") +
                                            (if (device.isBonded) " · Paired" else ""),
                                        style = MaterialTheme.typography.labelMedium,
                                        color = CyanGlow
                                    )
                                }
                                if (link?.state == ConnectionState.CONNECTED && link.nodeId != null) {
                                    Button(
                                        onClick = { onOpenChat(link.nodeId) },
                                        colors = ButtonDefaults.buttonColors(containerColor = SignalGreen)
                                    ) {
                                        Text("Chat")
                                    }
                                } else {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        if (!device.isBonded) {
                                            OutlinedButton(onClick = { viewModel.pairDevice(device.address) }) {
                                                Text("Pair", color = TextWhite)
                                            }
                                        }
                                        Button(
                                            onClick = { viewModel.connectToDevice(device.address) },
                                            colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue)
                                        ) {
                                            Text(
                                                when (link?.state) {
                                                    ConnectionState.CONNECTING -> "Linking..."
                                                    ConnectionState.AUTHENTICATING -> "Verifying..."
                                                    else -> "Connect"
                                                }
                                            )
                                        }
                                    }
                                }
                            }
                            if (link?.errorMessage != null) {
                                Spacer(Modifier.height(6.dp))
                                Text(link.errorMessage, style = MaterialTheme.typography.bodyMedium, color = ErrorCrimson)
                            }
                        }
                    }
                }
            }
        }
    }
}
