package com.freeconnect.app.ui.screens

import android.bluetooth.BluetoothAdapter
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.freeconnect.app.bluetooth.BluetoothPermissionHelper
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.components.GlowingPrimaryButton
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.ElectricBlue
import com.freeconnect.app.ui.theme.FreeConnectBorder
import com.freeconnect.app.ui.theme.FreeConnectCard
import com.freeconnect.app.ui.theme.SignalGreen
import com.freeconnect.app.ui.theme.TextMuted
import com.freeconnect.app.ui.theme.TextWhite
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel

/**
 * Screen 2: Futuristic Login / Local User Profile Screen.
 * Creates an offline cryptographic identity (ECDH P-256) and handles Android runtime
 * Bluetooth permissions without requiring any cloud account, email, or phone number.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    viewModel: FreeConnectViewModel,
    isOnboarding: Boolean = false,
    onBack: () -> Unit,
    onContinueToHome: () -> Unit = onBack
) {
    val context = LocalContext.current
    val profile by viewModel.localProfile.collectAsState()
    var name by remember(profile) { mutableStateOf(profile?.displayName ?: "") }
    var note by remember(profile) { mutableStateOf(profile?.statusNote ?: "Available over Bluetooth") }
    var colorIdx by remember(profile) { mutableIntStateOf(profile?.avatarColorIndex ?: 0) }
    var permTick by remember { mutableIntStateOf(0) }

    val fingerprint = remember(profile?.nodeId) { viewModel.getLocalFingerprint() }
    val requiredPerms = remember { BluetoothPermissionHelper.requiredPermissions() }
    val allGranted = remember(permTick) { BluetoothPermissionHelper.hasAllBluetoothPermissions(context) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) {
        permTick++
        if (BluetoothPermissionHelper.hasAllBluetoothPermissions(context)) {
            viewModel.startOfflineBluetoothServices()
        }
    }

    val enableBtLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { permTick++ }

    FuturisticBackground(scrimAlpha = 0.72f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text(
                                if (isOnboarding) "Offline Identity Setup" else "User Profile & Keys",
                                style = MaterialTheme.typography.headlineMedium
                            )
                            Text("Zero Cloud Account · Local Keystore", style = MaterialTheme.typography.labelMedium, color = CyanGlow)
                        }
                    },
                    navigationIcon = {
                        if (!isOnboarding) {
                            IconButton(onClick = onBack) {
                                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = TextWhite)
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
                )
            }
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                GlassCard(highlighted = true) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(Icons.Rounded.Key, contentDescription = null, tint = CyanGlow)
                        Column {
                            Text("Node ID: ${profile?.nodeId ?: "..."}", style = MaterialTheme.typography.titleMedium)
                            Text("ECDH P-256: $fingerprint", style = MaterialTheme.typography.labelMedium, color = CyanGlow)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Your private encryption key is generated locally inside Android Keystore and never transmitted to any server.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                GlassCard {
                    Text("Local Profile Identity", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Display Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = CyanGlow,
                            unfocusedBorderColor = FreeConnectBorder,
                            focusedTextColor = TextWhite,
                            unfocusedTextColor = TextWhite,
                            focusedContainerColor = FreeConnectCard,
                            unfocusedContainerColor = FreeConnectCard
                        )
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = note,
                        onValueChange = { note = it },
                        label = { Text("Offline Status Note") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = CyanGlow,
                            unfocusedBorderColor = FreeConnectBorder,
                            focusedTextColor = TextWhite,
                            unfocusedTextColor = TextWhite,
                            focusedContainerColor = FreeConnectCard,
                            unfocusedContainerColor = FreeConnectCard
                        )
                    )
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        AvatarPalette.forEachIndexed { idx, color ->
                            Box(
                                modifier = Modifier
                                    .size(38.dp)
                                    .clip(CircleShape)
                                    .background(color)
                                    .border(
                                        width = if (colorIdx == idx) 3.dp else 1.dp,
                                        color = if (colorIdx == idx) CyanGlow else Color.Transparent,
                                        shape = CircleShape
                                    )
                                    .clickable { colorIdx = idx }
                            )
                        }
                    }
                }

                GlassCard {
                    Text("Bluetooth Radio Permissions", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    requiredPerms.forEach { perm ->
                        val granted = BluetoothPermissionHelper.isPermissionGranted(context, perm)
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(perm.substringAfterLast('.'), style = MaterialTheme.typography.labelMedium, color = TextWhite)
                            Icon(
                                imageVector = if (granted) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked,
                                contentDescription = null,
                                tint = if (granted) SignalGreen else TextMuted,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(
                            onClick = { enableBtLauncher.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)) },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Enable Radio", color = TextWhite)
                        }
                        if (!allGranted) {
                            OutlinedButton(
                                onClick = { permissionLauncher.launch(requiredPerms.toTypedArray()) },
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("Grant Access", color = CyanGlow)
                            }
                        }
                    }
                }

                GlowingPrimaryButton(
                    text = if (isOnboarding) "ENTER FREECONNECT" else "SAVE PROFILE",
                    onClick = {
                        viewModel.saveProfile(name.ifBlank { "FreeConnect User" }, colorIdx, note)
                        if (allGranted) {
                            viewModel.startOfflineBluetoothServices()
                            onContinueToHome()
                        } else {
                            permissionLauncher.launch(requiredPerms.toTypedArray())
                        }
                    }
                )

                if (!isOnboarding) {
                    OutlinedButton(
                        onClick = { viewModel.regenerateIdentityKeys() },
                        modifier = Modifier.fillMaxWidth().height(48.dp)
                    ) {
                        Text("Rotate ECDH Identity Keypair", color = ElectricBlue)
                    }
                }
            }
        }
    }
}
