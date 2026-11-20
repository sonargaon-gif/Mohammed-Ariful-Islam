package com.freeconnect.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.FreeConnectSurface
import com.freeconnect.app.ui.theme.TextWhite
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel

/**
 * Screen 6: Offline Multi-Peer Group Chat Screen over Bluetooth Mesh.
 * Encrypts each group broadcast pairwise to every member node in the local Room peer table.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupChatScreen(
    viewModel: FreeConnectViewModel,
    onBack: () -> Unit
) {
    val peers by viewModel.peers.collectAsState()
    var groupMessages by remember { mutableStateOf(listOf("Trailhead Squad created over offline Bluetooth mesh.")) }
    var draft by remember { mutableStateOf("") }

    FuturisticBackground(scrimAlpha = 0.78f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text("Offline Group Room", style = MaterialTheme.typography.titleMedium)
                            Text("${peers.size + 1} mesh members · Pairwise E2EE", style = MaterialTheme.typography.labelMedium, color = CyanGlow)
                        }
                    },
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
                    .padding(16.dp)
            ) {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(groupMessages) { line ->
                        GlassCard(padding = 12.dp) {
                            Text(line, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = draft,
                        onValueChange = { draft = it },
                        placeholder = { Text("Send to all connected group peers...") },
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(onClick = {
                        val clean = draft.trim()
                        if (clean.isNotEmpty()) {
                            peers.forEach { peer -> viewModel.sendMessage(peer.nodeId, "[Group] $clean") }
                            groupMessages = groupMessages + "You: $clean"
                            draft = ""
                        }
                    }) {
                        Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = "Send Group", tint = CyanGlow)
                    }
                }
            }
        }
    }
}
