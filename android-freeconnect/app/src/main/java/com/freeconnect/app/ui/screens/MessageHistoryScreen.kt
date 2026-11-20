package com.freeconnect.app.ui.screens

import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.freeconnect.app.data.db.MessageStatus
import com.freeconnect.app.ui.components.FuturisticBackground
import com.freeconnect.app.ui.components.GlassCard
import com.freeconnect.app.ui.theme.CyanGlow
import com.freeconnect.app.ui.theme.FreeConnectBorder
import com.freeconnect.app.ui.theme.FreeConnectCard
import com.freeconnect.app.ui.theme.SignalGreen
import com.freeconnect.app.ui.theme.TextMuted
import com.freeconnect.app.ui.theme.TextWhite
import com.freeconnect.app.ui.theme.WarningAmber
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Screen 7: Futuristic Local Room Message History Archive.
 * Searchable, filterable record of every local encrypted message, hop count, and delivery state.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessageHistoryScreen(
    viewModel: FreeConnectViewModel,
    onBack: () -> Unit,
    onOpenChat: (String) -> Unit
) {
    val allMessages by viewModel.allMessages.collectAsState()
    val peers by viewModel.peers.collectAsState()
    val peerNames = remember(peers) { peers.associate { it.nodeId to it.displayName } }

    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("ALL") }
    val timeFormat = remember { SimpleDateFormat("MMM d · HH:mm", Locale.getDefault()) }

    val filtered = remember(allMessages, query, filter) {
        allMessages.filter { msg ->
            val matchFilter = when (filter) {
                "DELIVERED" -> msg.status == MessageStatus.DELIVERED
                "QUEUED" -> msg.status == MessageStatus.QUEUED_OFFLINE || msg.status == MessageStatus.RELAYING
                "RELAYED" -> msg.hopCount > 1
                else -> true
            }
            val q = query.trim().lowercase()
            val peerLabel = peerNames[msg.peerNodeId]?.lowercase().orEmpty()
            val matchQuery = q.isEmpty() || msg.plaintext.lowercase().contains(q) || peerLabel.contains(q)
            matchFilter && matchQuery
        }
    }

    FuturisticBackground(scrimAlpha = 0.76f) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text("Message History", style = MaterialTheme.typography.headlineMedium)
                            Text("${allMessages.size} local Room records", style = MaterialTheme.typography.labelMedium, color = CyanGlow)
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back", tint = TextWhite)
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
                    .padding(horizontal = 16.dp)
            ) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Search encrypted local history...", color = TextMuted) },
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

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("ALL" to "All", "DELIVERED" to "Delivered", "QUEUED" to "Queued", "RELAYED" to "Multi-Hop").forEach { (key, label) ->
                        FilterChip(
                            selected = filter == key,
                            onClick = { filter = key },
                            label = { Text(label) }
                        )
                    }
                }

                Spacer(Modifier.height(10.dp))

                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(filtered, key = { it.messageId }) { msg ->
                        GlassCard(
                            modifier = Modifier.clickable { onOpenChat(msg.peerNodeId) },
                            padding = 14.dp
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = (if (msg.isOutgoing) "To " else "From ") + (peerNames[msg.peerNodeId] ?: msg.peerNodeId),
                                    style = MaterialTheme.typography.titleMedium
                                )
                                Text(timeFormat.format(Date(msg.timestamp)), style = MaterialTheme.typography.labelMedium)
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(msg.plaintext, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyLarge)
                            Spacer(Modifier.height(6.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Icon(Icons.Rounded.Lock, contentDescription = null, tint = CyanGlow, modifier = Modifier.padding(end = 2.dp))
                                    Text(
                                        text = if (msg.hopCount > 1) "${msg.hopCount} hops · ${msg.routeTrace}" else "Direct Bluetooth",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = CyanGlow
                                    )
                                }
                                Text(
                                    text = msg.status.name.replace('_', ' '),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (msg.status == MessageStatus.DELIVERED) SignalGreen else WarningAmber
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
