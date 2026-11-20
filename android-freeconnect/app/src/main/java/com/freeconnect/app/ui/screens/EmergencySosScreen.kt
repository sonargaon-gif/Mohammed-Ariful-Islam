package com.freeconnect.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.freeconnect.app.data.db.ConnectionState
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.ErrorCrimson
import com.freeconnect.app.ui.theme.FreeConnectSurface
import com.freeconnect.app.ui.theme.TextWhite
import com.freeconnect.app.ui.theme.WarningAmber
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel

/**
 * Screen 12: Offline Bluetooth Emergency SOS Screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmergencySosScreen(
    viewModel: FreeConnectViewModel,
    onBack: () -> Unit
) {
    val activeLinks by viewModel.activeLinks.collectAsState()
    val peers by viewModel.peers.collectAsState()
    var sosText by remember { mutableStateOf("URGENT: Need immediate assistance. Sent via FreeConnect Bluetooth SOS.") }
    var lastBroadcastStatus by remember { mutableStateOf<String?>(null) }

    val connectedCount = activeLinks.values.count { it.state == ConnectionState.CONNECTED }

    FuturisticBackground(scrimAlpha = 0.76f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = { Text("Emergency SOS", style = MaterialTheme.typography.headlineMedium) },
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
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                GlassCard(highlighted = true) {
                    Text("Bluetooth-Only Emergency Broadcast", style = MaterialTheme.typography.titleMedium, color = WarningAmber)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Honest range notice: SOS messages relay ONLY through connected participating FreeConnect phones within Bluetooth range ($connectedCount direct link(s) active). They do not reach cellular 911/112 towers or devices outside the Bluetooth relay chain.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                OutlinedTextField(
                    value = sosText,
                    onValueChange = { sosText = it },
                    label = { Text("Priority Emergency Message") },
                    modifier = Modifier.fillMaxWidth()
                )

                Button(
                    onClick = {
                        peers.forEach { peer -> viewModel.sendMessage(peer.nodeId, "[PRIORITY SOS] $sosText") }
                        lastBroadcastStatus = "Dispatched priority SOS to ${peers.size} known mesh peer(s) ($connectedCount direct RFCOMM links)."
                    },
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = ErrorCrimson)
                ) {
                    Text("BROADCAST BLUETOOTH SOS", style = MaterialTheme.typography.titleMedium)
                }

                if (lastBroadcastStatus != null) {
                    GlassCard {
                        Text(lastBroadcastStatus!!, style = MaterialTheme.typography.bodyMedium, color = CyanGlow)
                    }
                }
            }
        }
    }
}
