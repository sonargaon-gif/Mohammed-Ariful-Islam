package com.freeconnect.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.freeconnect.app.data.db.ConnectionState
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.components.GlowingPrimaryButton
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.FreeConnectSurface
import com.freeconnect.app.ui.theme.SignalGreen
import com.freeconnect.app.ui.theme.TextWhite
import com.freeconnect.app.ui.theme.WarningAmber
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NetworkStatusScreen(
    viewModel: FreeConnectViewModel,
    onBack: () -> Unit
) {
    val activeLinks by viewModel.activeLinks.collectAsState()
    val queuedPackets by viewModel.queuedPackets.collectAsState()
    val seenCount by viewModel.seenPacketCount.collectAsState()
    val relayStats by viewModel.relayStats.collectAsState()
    val isBtEnabled by viewModel.isBluetoothEnabled.collectAsState()
    val isBleAdvertising by viewModel.isBleAdvertising.collectAsState()

    val connectedPeers = activeLinks.values.count { it.state == ConnectionState.CONNECTED }

    FuturisticBackground(scrimAlpha = 0.74f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = { Text("Mesh Network Status", style = MaterialTheme.typography.headlineMedium) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = TextWhite)
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
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                GlassCard(highlighted = isBtEnabled) {
                    Text("Bluetooth Radio & Transport", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    StatLine("Bluetooth Radio", if (isBtEnabled) "Enabled (Offline Only)" else "Disabled", if (isBtEnabled) SignalGreen else WarningAmber)
                    StatLine("BLE Presence Beacon", if (isBleAdvertising) "Advertising FreeConnect UUID" else "RFCOMM Ready", CyanGlow)
                    StatLine("Direct RFCOMM Links", "$connectedPeers / 5 active")
                    StatLine("Internet / Wi-Fi / SIM", "0 bytes (No INTERNET permission)", SignalGreen)
                }

                GlassCard {
                    Text("Multi-Hop Relay Engine", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    StatLine("Queued Offline Packets", "${queuedPackets.size}", WarningAmber)
                    StatLine("Opaque Packets Relayed", "${relayStats.relayedPacketsCount}", CyanGlow)
                    StatLine("Duplicates / Loops Blocked", "${relayStats.deduplicatedDropsCount}")
                    StatLine("Expired Packets Pruned", "${relayStats.expiredDropsCount}")
                    StatLine("Seen UUID Cache Entries", "$seenCount")
                    Spacer(Modifier.height(8.dp))
                    Text(relayStats.lastRelayEvent, style = MaterialTheme.typography.bodyMedium)
                }

                GlowingPrimaryButton(
                    text = "FLUSH OFFLINE QUEUE NOW",
                    onClick = { viewModel.flushQueueNow() }
                )

                GlassCard {
                    Text("Physical Range & Hardware Limits", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Bluetooth Class 2 hardware typically reaches 10–30 meters unobstructed per hop. Multi-hop relay extends reach ONLY when physical participating FreeConnect phones form a real chain within range.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }
}

@Composable
private fun StatLine(
    label: String,
    value: String,
    valueColor: Color = TextWhite
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.labelMedium, color = valueColor)
    }
}
