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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.freeconnect.app.data.db.MessageEntity
import com.freeconnect.app.data.db.MessageStatus
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.ElectricBlue
import com.freeconnect.app.ui.theme.ElectricBlueBright
import com.freeconnect.app.ui.theme.FreeConnectBorder
import com.freeconnect.app.ui.theme.FreeConnectCard
import com.freeconnect.app.ui.theme.FreeConnectSurface
import com.freeconnect.app.ui.theme.SignalGreen
import com.freeconnect.app.ui.theme.TextMuted
import com.freeconnect.app.ui.theme.TextWhite
import com.freeconnect.app.ui.theme.WarningAmber
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    peerNodeId: String,
    viewModel: FreeConnectViewModel,
    onBack: () -> Unit
) {
    val peers by viewModel.peers.collectAsState()
    val peer = peers.firstOrNull { it.nodeId == peerNodeId }
    val messages by remember(peerNodeId) {
        viewModel.observeConversation(peerNodeId)
    }.collectAsState(initial = emptyList())

    var draft by remember { mutableStateOf("") }

    FuturisticBackground(scrimAlpha = 0.80f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text(peer?.displayName ?: peerNodeId, style = MaterialTheme.typography.titleMedium)
                            Text(
                                text = when {
                                    peer?.isDirectlyConnected == true -> "Direct Bluetooth · AES-256-GCM"
                                    peer?.reachableViaNodeId != null -> "Mesh Relay (${peer.hopDistance} hops) · E2E Encrypted"
                                    else -> "Offline · Messages queue & relay"
                                },
                                style = MaterialTheme.typography.labelMedium,
                                color = if (peer?.isDirectlyConnected == true) SignalGreen else CyanGlow
                            )
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = TextWhite)
                        }
                    },
                    actions = {
                        IconButton(onClick = { viewModel.deleteConversation(peerNodeId) }) {
                            Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete conversation", tint = TextMuted)
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
            ) {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(messages, key = { it.messageId }) { msg ->
                        FuturisticChatBubble(msg)
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(FreeConnectSurface)
                        .border(1.dp, FreeConnectBorder)
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = draft,
                        onValueChange = { draft = it },
                        placeholder = { Text("Encrypted offline message...", color = TextMuted) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(16.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = CyanGlow,
                            unfocusedBorderColor = FreeConnectBorder,
                            focusedTextColor = TextWhite,
                            unfocusedTextColor = TextWhite,
                            focusedContainerColor = FreeConnectCard,
                            unfocusedContainerColor = FreeConnectCard
                        )
                    )
                    IconButton(
                        onClick = {
                            viewModel.sendMessage(peerNodeId, draft)
                            draft = ""
                        }
                    ) {
                        Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = "Send", tint = CyanGlow)
                    }
                }
            }
        }
    }
}

@Composable
private fun FuturisticChatBubble(message: MessageEntity) {
    val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
    val bubbleShape = RoundedCornerShape(
        topStart = 18.dp,
        topEnd = 18.dp,
        bottomStart = if (message.isOutgoing) 18.dp else 4.dp,
        bottomEnd = if (message.isOutgoing) 4.dp else 18.dp
    )
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = if (message.isOutgoing) Alignment.CenterEnd else Alignment.CenterStart
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 290.dp)
                .clip(bubbleShape)
                .background(
                    if (message.isOutgoing) {
                        Brush.horizontalGradient(listOf(ElectricBlue, ElectricBlueBright))
                    } else {
                        Brush.verticalGradient(listOf(FreeConnectCard, Color(0xCC0A1830)))
                    }
                )
                .border(
                    width = 1.dp,
                    color = if (message.isOutgoing) CyanGlow.copy(alpha = 0.55f) else FreeConnectBorder,
                    shape = bubbleShape
                )
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            Text(message.plaintext, style = MaterialTheme.typography.bodyLarge, color = TextWhite)
            Spacer(Modifier.height(4.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    timeFormat.format(Date(message.timestamp)),
                    style = MaterialTheme.typography.labelMedium,
                    color = TextWhite.copy(alpha = 0.72f)
                )
                if (message.isOutgoing) {
                    Text(
                        text = when (message.status) {
                            MessageStatus.QUEUED_OFFLINE -> "Queued offline"
                            MessageStatus.RELAYING -> "Relaying"
                            MessageStatus.SENT -> "Sent"
                            MessageStatus.DELIVERED -> if (message.hopCount > 1) "Delivered (${message.hopCount} hops)" else "Delivered"
                            MessageStatus.EXPIRED -> "Expired"
                            MessageStatus.FAILED -> "Failed"
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = if (message.status == MessageStatus.QUEUED_OFFLINE) WarningAmber else CyanGlow
                    )
                }
            }
        }
    }
}
