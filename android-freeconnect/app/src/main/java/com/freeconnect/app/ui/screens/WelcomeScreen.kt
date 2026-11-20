package com.freeconnect.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bluetooth
import androidx.compose.material.icons.rounded.CreditCardOff
import androidx.compose.material.icons.rounded.NoSim
import androidx.compose.material.icons.rounded.SignalCellularOff
import androidx.compose.material.icons.rounded.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.components.GlowingPrimaryButton
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.ElectricBlue
import com.freeconnect.app.ui.theme.TextMuted
import com.freeconnect.app.ui.theme.TextWhite

val AvatarPalette = listOf(
    Color(0xFF2563EB),
    Color(0xFF06B6D4),
    Color(0xFF10B981),
    Color(0xFF6366F1),
    Color(0xFFF59E0B)
)

@Composable
fun WelcomeScreen(
    onStartConnecting: () -> Unit
) {
    FuturisticBackground(scrimAlpha = 0.42f) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp, vertical = 42.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Top Brand Identity
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "FREECONNECT",
                    style = MaterialTheme.typography.displaySmall.copy(
                        letterSpacing = 3.sp,
                        fontWeight = FontWeight.ExtraBold
                    ),
                    color = TextWhite,
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "100% Offline Messenger",
                    style = MaterialTheme.typography.titleMedium,
                    color = CyanGlow,
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(14.dp))
                Text(
                    text = "Connect • Chat • Share\nWithout Internet",
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                    color = TextWhite.copy(alpha = 0.9f),
                    textAlign = TextAlign.Center
                )
            }

            // Center Luminous Bluetooth Emblem Accent (complements the background artwork)
            Box(
                modifier = Modifier
                    .size(94.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.radialGradient(
                            colors = listOf(
                                CyanGlow.copy(alpha = 0.28f),
                                ElectricBlue.copy(alpha = 0.14f),
                                Color.Transparent
                            )
                        )
                    )
                    .border(1.5.dp, CyanGlow.copy(alpha = 0.65f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Rounded.Bluetooth,
                    contentDescription = "FreeConnect Bluetooth Mesh",
                    tint = CyanGlow,
                    modifier = Modifier.size(48.dp)
                )
            }

            // Bottom Glass Features + Primary CTA + Slogan
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                GlassCard(padding = 14.dp, cornerRadius = 22.dp) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        OfflineFeatureTile(Icons.Rounded.WifiOff, "No Internet", Modifier.weight(1f))
                        OfflineFeatureTile(Icons.Rounded.SignalCellularOff, "No Mobile\nData", Modifier.weight(1f))
                        OfflineFeatureTile(Icons.Rounded.NoSim, "No SIM\nBalance", Modifier.weight(1f))
                        OfflineFeatureTile(Icons.Rounded.CreditCardOff, "No\nSubscription", Modifier.weight(1f))
                    }
                }

                Spacer(Modifier.height(22.dp))

                GlowingPrimaryButton(
                    text = "START CONNECTING",
                    onClick = onStartConnecting
                )

                Spacer(Modifier.height(14.dp))

                Text(
                    text = "Be Connected... Always!",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontWeight = FontWeight.Medium,
                        letterSpacing = 0.6.sp
                    ),
                    color = CyanGlow.copy(alpha = 0.9f),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
private fun OfflineFeatureTile(
    icon: ImageVector,
    label: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(ElectricBlue.copy(alpha = 0.22f))
                .border(1.dp, CyanGlow.copy(alpha = 0.45f), RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = CyanGlow,
                modifier = Modifier.size(20.dp)
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = TextWhite.copy(alpha = 0.88f),
            textAlign = TextAlign.Center,
            lineHeight = 14.sp
        )
    }
}
