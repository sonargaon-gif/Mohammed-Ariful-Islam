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
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
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
import com.freeconnect.app.media.VoiceRecorderManager
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.components.GlowingPrimaryButton
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.ErrorCrimson
import com.freeconnect.app.ui.theme.FreeConnectSurface
import com.freeconnect.app.ui.theme.TextWhite

/**
 * Screen 8: Dedicated Offline Voice Message Recorder & Player Screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoiceMessageScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val recorder = remember { VoiceRecorderManager(context) }
    var isRecording by remember { mutableStateOf(false) }
    var notes by remember { mutableStateOf<List<VoiceRecorderManager.RecordedVoiceNote>>(emptyList()) }

    FuturisticBackground(scrimAlpha = 0.76f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = { Text("Offline Voice Messages", style = MaterialTheme.typography.headlineMedium) },
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
                GlassCard(highlighted = isRecording) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(
                            imageVector = if (isRecording) Icons.Rounded.Stop else Icons.Rounded.Mic,
                            contentDescription = null,
                            tint = if (isRecording) ErrorCrimson else CyanGlow
                        )
                        Column {
                            Text(
                                if (isRecording) "Recording AAC 32kbps Voice Note..." else "Ready to Record Offline Audio",
                                style = MaterialTheme.typography.titleMedium
                            )
                            Text("Compact M4A bitrate optimized for Bluetooth RFCOMM.", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    GlowingPrimaryButton(
                        text = if (isRecording) "STOP & SAVE VOICE NOTE" else "START RECORDING",
                        onClick = {
                            if (!isRecording) {
                                if (recorder.startRecording().isSuccess) isRecording = true
                            } else {
                                isRecording = false
                                recorder.stopRecording()?.let { notes = listOf(it) + notes }
                            }
                        }
                    )
                }

                notes.forEach { note ->
                    GlassCard(padding = 14.dp) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(note.fileName, style = MaterialTheme.typography.titleMedium)
                                Text(
                                    "${note.durationMs / 1000}s · ${note.sizeBytes / 1024} KB · Local M4A",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = CyanGlow
                                )
                            }
                            IconButton(onClick = { recorder.togglePlayback(note.filePath) }) {
                                Icon(Icons.Rounded.PlayArrow, contentDescription = "Play", tint = CyanGlow)
                            }
                        }
                    }
                }
            }
        }
    }
}
