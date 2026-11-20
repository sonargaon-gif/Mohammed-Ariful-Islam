package com.freeconnect.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
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
import com.freeconnect.app.data.repository.BatteryProfile
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.FreeConnectSurface
import com.freeconnect.app.ui.theme.TextWhite
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel

/**
 * Screen 19: Battery-Saving & Android Background Optimization Screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BatterySavingScreen(
    viewModel: FreeConnectViewModel,
    onBack: () -> Unit
) {
    val settings by viewModel.settings.collectAsState()

    FuturisticBackground(scrimAlpha = 0.76f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = { Text("Battery Optimization", style = MaterialTheme.typography.headlineMedium) },
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
                    Text("Bluetooth Scan Duty-Cycle Profile", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    Text("Current Mode: ${settings.batteryProfile.name}", style = MaterialTheme.typography.labelMedium, color = CyanGlow)
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        BatteryProfile.entries.forEach { mode ->
                            OutlinedButton(onClick = { viewModel.updateBatteryProfile(mode) }) {
                                Text(
                                    mode.name.replace('_', ' '),
                                    color = if (settings.batteryProfile == mode) CyanGlow else TextWhite
                                )
                            }
                        }
                    }
                }

                GlassCard {
                    Text("Android Background Execution Compliance", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "FreeConnect uses a single connectedDevice Foreground Service with BLE duty-cycle scanning instead of continuous Bluetooth Classic inquiry scans to preserve battery during all-day offline mesh use.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }
}
