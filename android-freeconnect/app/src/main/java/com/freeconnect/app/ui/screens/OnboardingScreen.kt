package com.freeconnect.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.components.GlowingPrimaryButton
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.TextWhite

/**
 * Screen 2: 3-Step Futuristic Offline Onboarding Screen.
 */
@Composable
fun OnboardingScreen(onFinish: () -> Unit) {
    val slides = listOf(
        Triple(
            "Pure Bluetooth Communication",
            "Chat, send voice notes, share documents, and broadcast SOS alerts strictly over Bluetooth Classic & BLE — zero Wi-Fi, cellular, or cloud servers.",
            "01 / 03 · Zero Internet Permission"
        ),
        Triple(
            "Multi-Hop Encrypted Mesh Relay",
            "Extend reach across nearby FreeConnect phones (Phone A → B → C → D) with automatic store-and-forward queuing. Relay devices forward opaque ciphertext without reading.",
            "02 / 03 · End-to-End AES-256-GCM"
        ),
        Triple(
            "Private Local Ownership",
            "Your keys, contacts, voice notes, and Room chat history stay exclusively on your device. Protect sensitive chats with local PIN or biometric lock.",
            "03 / 03 · Be Connected... Always!"
        )
    )
    var index by remember { mutableIntStateOf(0) }
    val (title, body, step) = slides[index]

    FuturisticBackground(scrimAlpha = 0.65f) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp, vertical = 48.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(step, style = MaterialTheme.typography.labelMedium, color = CyanGlow)
                Spacer(Modifier.height(14.dp))
                Text(title, style = MaterialTheme.typography.headlineLarge)
                Spacer(Modifier.height(12.dp))
                GlassCard(highlighted = true) {
                    Text(body, style = MaterialTheme.typography.bodyLarge)
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                GlowingPrimaryButton(
                    text = if (index < slides.lastIndex) "NEXT" else "SETUP BLUETOOTH PERMISSIONS",
                    onClick = {
                        if (index < slides.lastIndex) index++ else onFinish()
                    }
                )
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    OutlinedButton(onClick = onFinish) {
                        Text("Skip", color = TextWhite)
                    }
                }
            }
        }
    }
}
