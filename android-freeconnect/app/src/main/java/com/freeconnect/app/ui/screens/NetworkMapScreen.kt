package com.freeconnect.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.ElectricBlueBright
import com.freeconnect.app.ui.theme.FreeConnectSurface
import com.freeconnect.app.ui.theme.SignalGreen
import com.freeconnect.app.ui.theme.TextWhite
import com.freeconnect.app.ui.theme.WarningAmber
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Screen 13: Interactive Futuristic Network Topology Map using Jetpack Compose Canvas.
 * Visualizes local handset, direct connected RFCOMM links, multi-hop relay peers, and offline nodes.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NetworkMapScreen(
    viewModel: FreeConnectViewModel,
    onBack: () -> Unit
) {
    val peers by viewModel.peers.collectAsState()
    val relayStats by viewModel.relayStats.collectAsState()

    FuturisticBackground(scrimAlpha = 0.72f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = { Text("Bluetooth Network Map", style = MaterialTheme.typography.headlineMedium) },
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
                    Canvas(modifier = Modifier.fillMaxWidth().height(260.dp)) {
                        val center = Offset(size.width / 2f, size.height / 2f)
                        val radius = size.minDimension * 0.36f

                        // Concentric range rings
                        drawCircle(CyanGlow.copy(alpha = 0.22f), radius * 0.6f, center, style = Stroke(2f))
                        drawCircle(ElectricBlueBright.copy(alpha = 0.18f), radius, center, style = Stroke(2f))

                        // Peer nodes arranged radially
                        peers.forEachIndexed { idx, peer ->
                            val angle = (2.0 * PI * idx / peers.size.coerceAtLeast(1)) - PI / 2
                            val px = center.x + (radius * cos(angle)).toFloat()
                            val py = center.y + (radius * sin(angle)).toFloat()
                            val nodePos = Offset(px, py)
                            val lineColor = if (peer.isDirectlyConnected) CyanGlow else WarningAmber.copy(alpha = 0.45f)

                            drawLine(
                                color = lineColor,
                                start = center,
                                end = nodePos,
                                strokeWidth = if (peer.isDirectlyConnected) 5f else 2.5f
                            )
                            drawCircle(
                                color = if (peer.isDirectlyConnected) SignalGreen else WarningAmber,
                                radius = 16f,
                                center = nodePos
                            )
                        }

                        // Local phone center node
                        drawCircle(ElectricBlueBright, 22f, center)
                        drawCircle(CyanGlow, 28f, center, style = Stroke(3f))
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Relayed: ${relayStats.relayedPacketsCount} · Dedup Blocked: ${relayStats.deduplicatedDropsCount}",
                        style = MaterialTheme.typography.labelMedium,
                        color = CyanGlow
                    )
                }
            }
        }
    }
}
