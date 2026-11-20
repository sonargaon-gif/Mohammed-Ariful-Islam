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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.freeconnect.app.security.SecurityLockManager
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.components.GlowingPrimaryButton
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.ErrorCrimson
import com.freeconnect.app.ui.theme.FreeConnectSurface
import com.freeconnect.app.ui.theme.TextWhite
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel

/**
 * Screen 18: Privacy & Security Vault (App PIN, Biometrics, Private Chat Protection, Zero Cloud Storage).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrivacyScreen(
    viewModel: FreeConnectViewModel,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val lockManager = remember { SecurityLockManager(context) }
    var pinInput by remember { mutableStateOf("") }
    var pinSet by remember { mutableStateOf(lockManager.isAppPinConfigured()) }
    var bioEnabled by remember { mutableStateOf(lockManager.isBiometricEnabled()) }

    FuturisticBackground(scrimAlpha = 0.76f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = { Text("Privacy & Security", style = MaterialTheme.typography.headlineMedium) },
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
                GlassCard(highlighted = pinSet) {
                    Text("Local App PIN Lock (PBKDF2-SHA256)", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = pinInput,
                        onValueChange = { if (it.length <= 6) pinInput = it },
                        label = { Text("Enter 4–6 digit local PIN") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(10.dp))
                    GlowingPrimaryButton(
                        text = if (pinSet) "UPDATE APP PIN" else "ENABLE APP PIN",
                        onClick = {
                            if (pinInput.length >= 4) {
                                lockManager.setAppPin(pinInput)
                                pinSet = true
                                pinInput = ""
                            }
                        }
                    )
                }

                GlassCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Biometric Unlock", style = MaterialTheme.typography.titleMedium)
                            Text("Use Android BiometricPrompt when unlocking FreeConnect.", style = MaterialTheme.typography.bodyMedium)
                        }
                        Switch(
                            checked = bioEnabled,
                            onCheckedChange = {
                                bioEnabled = it
                                lockManager.setBiometricEnabled(it)
                            }
                        )
                    }
                }

                GlassCard {
                    Text("Zero-Knowledge Relay Guarantee", style = MaterialTheme.typography.titleMedium, color = CyanGlow)
                    Spacer(Modifier.height(6.dp))
                    Text("All messages are end-to-end encrypted via ECDH P-256 + AES-256-GCM. Relay devices cannot decrypt forwarded payloads and zero data is sent to cloud servers.", style = MaterialTheme.typography.bodyMedium)
                }

                Button(
                    onClick = { viewModel.deleteAllLocalChatData() },
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = ErrorCrimson)
                ) {
                    Text("Delete All Local Chat History")
                }
            }
        }
    }
}
