package com.freeconnect.app.ui.screens

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.BluetoothSearching
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Hub
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.Message
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.freeconnect.app.data.db.ConnectionState
import com.freeconnect.app.data.db.MessageEntity
import com.freeconnect.app.data.db.PeerEntity
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.ElectricBlue
import com.freeconnect.app.ui.theme.FreeConnectSurface
import com.freeconnect.app.ui.theme.SignalGreen
import com.freeconnect.app.ui.theme.TextMuted
import com.freeconnect.app.ui.theme.TextWhite
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: FreeConnectViewModel,
    onOpenChat: (String) -> Unit,
    onOpenNearby: () -> Unit,
    onOpenConnections: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenNetwork: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenSettings: () -> Unit
) {
    val peers by viewModel.peers.collectAsState()
    val allMessages by viewModel.allMessages.collectAsState()
    val activeLinks by viewModel.activeLinks.collectAsState()
    val queuedPackets by viewModel.queuedPackets.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.startOfflineBluetoothServices()
    }

    val connectedCount = activeLinks.values.count { it.state == ConnectionState.CONNECTED }
    val latestByPeer: Map<String, MessageEntity> = allMessages.groupBy { it.peerNodeId }
        .mapValues { (_, msgs) -> msgs.maxBy { it.timestamp } }

    FuturisticBackground(scrimAlpha = 0.76f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text("FreeConnect", style = MaterialTheme.typography.headlineMedium)
                            Text(
                                "$connectedCount connected · ${queuedPackets.size} queued offline",
                                style = MaterialTheme.typography.labelMedium,
                                color = CyanGlow
                            )
                        }
                    },
                    actions = {
                        IconButton(onClick = onOpenHistory) {
                            Icon(Icons.Rounded.History, contentDescription = "Message History", tint = CyanGlow)
                        }
                        IconButton(onClick = onOpenProfile) {
                            Icon(Icons.Rounded.Person, contentDescription = "Profile", tint = TextWhite)
                        }
                        IconButton(onClick = onOpenSettings) {
                            Icon(Icons.Rounded.Settings, contentDescription = "Settings", tint = TextWhite)
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = FreeConnectSurface)
                )
            },
            floatingActionButton = {
                FloatingActionButton(
                    onClick = onOpenNearby,
                    containerColor = ElectricBlue,
                    contentColor = TextWhite
                ) {
                    Icon(Icons.Rounded.BluetoothSearching, contentDescription = "Find Nearby Devices")
                }
            },
            bottomBar = {
                NavigationBar(containerColor = FreeConnectSurface) {
                    NavigationBarItem(
                        selected = true,
                        onClick = {},
                        icon = { Icon(Icons.Rounded.Message, contentDescription = "Chats") },
                        label = { Text("Chats") }
                    )
                    NavigationBarItem(
                        selected = false,
                        onClick = onOpenNearby,
                        icon = { Icon(Icons.Rounded.BluetoothSearching, contentDescription = "Nearby") },
                        label = { Text("Nearby") }
                    )
                    NavigationBarItem(
                        selected = false,
                        onClick = onOpenConnections,
                        icon = { Icon(Icons.Rounded.Link, contentDescription = "Links") },
                        label = { Text("Links") }
                    )
                    NavigationBarItem(
                        selected = false,
                        onClick = onOpenNetwork,
                        icon = { Icon(Icons.Rounded.Hub, contentDescription = "Mesh") },
                        label = { Text("Mesh") }
                    )
                }
            }
        ) { padding ->
            if (peers.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(28.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    GlassCard(highlighted = true) {
                        Text("No offline conversations yet", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Tap the Bluetooth scan button to discover nearby FreeConnect phones and open an encrypted RFCOMM link.",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(peers, key = { it.nodeId }) { peer ->
                        ConversationGlassCard(
                            peer = peer,
                            lastMessage = latestByPeer[peer.nodeId],
                            onClick = { onOpenChat(peer.nodeId) },
                            onDelete = { viewModel.deleteConversation(peer.nodeId) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ConversationGlassCard(
    peer: PeerEntity,
    lastMessage: MessageEntity?,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
    GlassCard(
        modifier = Modifier.clickable(onClick = onClick),
        padding = 14.dp,
        highlighted = peer.isDirectlyConnected
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(AvatarPalette[peer.avatarColorIndex % AvatarPalette.size])
                    .border(1.5.dp, CyanGlow.copy(alpha = 0.6f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    peer.displayName.take(2).uppercase(),
                    style = MaterialTheme.typography.titleMedium,
                    color = TextWhite
                )
            }

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(peer.displayName, style = MaterialTheme.typography.titleMedium)
                    if (lastMessage != null) {
                        Text(
                            timeFormat.format(Date(lastMessage.timestamp)),
                            style = MaterialTheme.typography.labelMedium
                        )
                    }
                }
                Spacer(Modifier.height(3.dp))
                Text(
                    text = lastMessage?.plaintext ?: if (peer.isDirectlyConnected) {
                        "Connected via Bluetooth · Ready to chat"
                    } else {
                        "Reachable in ${peer.hopDistance} hop(s) · E2E Encrypted"
                    },
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = if (peer.isDirectlyConnected) {
                        "Direct Bluetooth · ${peer.nodeId}"
                    } else if (peer.reachableViaNodeId != null) {
                        "Mesh Relay via ${peer.reachableViaNodeId} · ${peer.hopDistance} hops"
                    } else {
                        "Offline · Store-and-forward queue active"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = if (peer.isDirectlyConnected) SignalGreen else CyanGlow
                )
            }

            if (lastMessage != null) {
                IconButton(onClick = onDelete) {
                    Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete chat", tint = TextMuted)
                }
            }
        }
    }
}
