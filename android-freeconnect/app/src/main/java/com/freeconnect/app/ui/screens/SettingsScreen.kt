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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.freeconnect.app.data.repository.BatteryProfile
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.ErrorCrimson
import com.freeconnect.app.ui.theme.FreeConnectSurface
import com.freeconnect.app.ui.theme.TextWhite
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: FreeConnectViewModel,
    onBack: () -> Unit
) {
    val settings by viewModel.settings.collectAsState()
    var showDeleteConfirm by remember { mutableStateOf(false) }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Delete All Local Chat Data?") },
            text = { Text("This permanently erases all local Room chat history, queued relay packets, and deduplication records on this phone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteAllLocalChatData()
                        showDeleteConfirm = false
                    }
                ) {
                    Text("Delete All", color = ErrorCrimson)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancel") }
            }
        )
    }

    FuturisticBackground(scrimAlpha = 0.76f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = { Text("Settings", style = MaterialTheme.typography.headlineMedium) },
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
                GlassCard(highlighted = settings.relayEnabled) {
                    SettingToggleRow(
                        title = "Enable Multi-Hop Mesh Relay",
                        subtitle = "Forward opaque encrypted packets between nearby FreeConnect phones without reading them.",
                        checked = settings.relayEnabled,
                        onCheckedChange = viewModel::updateRelayEnabled
                    )
                    Spacer(Modifier.height(12.dp))
                    Text("Max Hop Limit (TTL): ${settings.maxHopTtl} hops", style = MaterialTheme.typography.titleMedium)
                    Slider(
                        value = settings.maxHopTtl.toFloat(),
                        onValueChange = { viewModel.updateMaxHopTtl(it.roundToInt()) },
                        valueRange = 1f..6f,
                        steps = 4
                    )
                }

                GlassCard {
                    Text("Message Expiration Window: ${settings.messageExpiryHours}h", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(1, 6, 24, 72).forEach { hrs ->
                            OutlinedButton(onClick = { viewModel.updateExpiryHours(hrs) }) {
                                Text("${hrs}h", color = if (settings.messageExpiryHours == hrs) CyanGlow else TextWhite)
                            }
                        }
                    }
                }

                GlassCard {
                    SettingToggleRow(
                        title = "Automatic Reconnection",
                        subtitle = "Retry disconnected peer RFCOMM links using exponential backoff.",
                        checked = settings.autoReconnect,
                        onCheckedChange = viewModel::updateAutoReconnect
                    )
                    Spacer(Modifier.height(12.dp))
                    Text("Battery Optimization Profile", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        BatteryProfile.entries.forEach { profile ->
                            OutlinedButton(onClick = { viewModel.updateBatteryProfile(profile) }) {
                                Text(
                                    profile.name.replace('_', ' '),
                                    color = if (settings.batteryProfile == profile) CyanGlow else TextWhite
                                )
                            }
                        }
                    }
                }

                Button(
                    onClick = { showDeleteConfirm = true },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = ErrorCrimson)
                ) {
                    Text("Delete All Local Chat Data")
                }
            }
        }
    }
}

@Composable
private fun SettingToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(subtitle, style = MaterialTheme.typography.bodyMedium)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
