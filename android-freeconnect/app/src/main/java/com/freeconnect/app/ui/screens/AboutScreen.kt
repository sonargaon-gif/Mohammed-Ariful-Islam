package com.freeconnect.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.FreeConnectSurface
import com.freeconnect.app.ui.theme.TextWhite

/**
 * Screen 20: About FreeConnect Screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AboutScreen(onBack: () -> Unit) {
    FuturisticBackground(scrimAlpha = 0.72f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = { Text("About FreeConnect", style = MaterialTheme.typography.headlineMedium) },
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
                    Text("FREECONNECT ULTIMATE", style = MaterialTheme.typography.headlineMedium)
                    Text("Connect • Chat • Share — Without Internet", style = MaterialTheme.typography.titleMedium, color = CyanGlow)
                    Spacer(Modifier.height(8.dp))
                    Text("Mission: Free communication for everyone. Zero internet permission, zero cloud servers, zero subscriptions.", style = MaterialTheme.typography.bodyLarge)
                    Spacer(Modifier.height(8.dp))
                    Text("Be Connected... Always!", style = MaterialTheme.typography.labelMedium, color = CyanGlow)
                }

                GlassCard {
                    Text("Honest Engineering Transparency", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Bluetooth Classic Class 2 typically communicates 10–30 meters per hop unobstructed. Multi-hop relay extends distance ONLY when physical participating FreeConnect devices form an active chain.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }
}
