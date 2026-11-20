package com.freeconnect.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import com.freeconnect.app.pairing.QrPairingCodec
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.FreeConnectSurface
import com.freeconnect.app.ui.theme.TextWhite
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel

/**
 * Screen 11: Offline QR Code Pairing & Scanner Screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QrScannerScreen(
    viewModel: FreeConnectViewModel,
    onBack: () -> Unit
) {
    val profile by viewModel.localProfile.collectAsState()
    val qrUri = remember(profile) {
        QrPairingCodec.encodeUri(
            QrPairingCodec.PairingPayload(
                nodeId = profile?.nodeId ?: "FC-LOCAL",
                displayName = profile?.displayName ?: "FreeConnect User",
                bluetoothAddress = "LOCAL-BT",
                publicKeyBase64 = viewModel.getLocalFingerprint()
            )
        )
    }
    val qrBitmap = remember(qrUri) { QrPairingCodec.generateQrBitmap(qrUri, 420) }

    FuturisticBackground(scrimAlpha = 0.76f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = { Text("QR Bluetooth Pairing", style = MaterialTheme.typography.headlineMedium) },
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
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                GlassCard(highlighted = true) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("My Offline Pairing QR", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(12.dp))
                        Image(
                            bitmap = qrBitmap.asImageBitmap(),
                            contentDescription = "FreeConnect Pairing QR Code",
                            modifier = Modifier
                                .size(220.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .background(Color.White)
                                .padding(8.dp)
                        )
                        Spacer(Modifier.height(10.dp))
                        Text(profile?.nodeId ?: "...", style = MaterialTheme.typography.labelMedium, color = CyanGlow)
                        Text("Scan with another FreeConnect phone to pair & verify ECDH keys offline.", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}
