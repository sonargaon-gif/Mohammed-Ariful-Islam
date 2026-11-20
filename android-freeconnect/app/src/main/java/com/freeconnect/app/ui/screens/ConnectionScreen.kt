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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import com.freeconnect.app.ui.theme.WarningAmber
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectionScreen(
    viewModel: FreeConnectViewModel,
    onBack: () -> Unit,
    onOpenChat: (String) -> Unit
) {
    val activeLinks by viewModel.activeLinks.collectAsState()
    val links = activeLinks.values.toList()

    FuturisticBackground(scrimAlpha = 0.76f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = { Text("Bluetooth Connections", style = MaterialTheme.typography.headlineMedium) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = TextWhite)
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = FreeConnectSurface)
                )
            }
        ) { padding ->
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (links.isEmpty()) {
                    item {
                        GlassCard {
                            Text(
                                "No active RFCOMM Bluetooth sockets yet. Open Nearby Devices to connect to a FreeConnect phone.",
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }

                items(links, key = { it.address }) { link ->
                    GlassCard(highlighted = link.state == ConnectionState.CONNECTED) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(link.displayName, style = MaterialTheme.typography.titleMedium)
                            Text(
                                text = link.state.name,
                                style = MaterialTheme.typography.labelMedium,
                                color = when (link.state) {
                                    ConnectionState.CONNECTED -> SignalGreen
                                    ConnectionState.CONNECTING, ConnectionState.AUTHENTICATING -> WarningAmber
                                    else -> ErrorCrimson
                                }
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        Text("Address: ${link.address}", style = MaterialTheme.typography.labelMedium)
                        if (link.safetyNumber.isNotBlank()) {
                            Text(
                                "ECDH Safety Number: ${link.safetyNumber}",
                                style = MaterialTheme.typography.labelMedium,
                                color = CyanGlow
                            )
                        }
                        Text(
                            "TX ${link.bytesSent} B · RX ${link.bytesReceived} B",
                            style = MaterialTheme.typography.labelMedium
                        )
                        if (link.errorMessage != null) {
                            Spacer(Modifier.height(4.dp))
                            Text(link.errorMessage, style = MaterialTheme.typography.bodyMedium, color = ErrorCrimson)
                        }

                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            if (link.state == ConnectionState.CONNECTED) {
                                if (link.nodeId != null) {
                                    Button(
                                        onClick = { onOpenChat(link.nodeId) },
                                        colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue)
                                    ) {
                                        Text("Private Chat")
                                    }
                                }
                                OutlinedButton(onClick = { viewModel.disconnectDevice(link.address) }) {
                                    Text("Disconnect", color = TextWhite)
                                }
                            } else {
                                Button(
                                    onClick = { viewModel.connectToDevice(link.address) },
                                    colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue)
                                ) {
                                    Text("Reconnect")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
