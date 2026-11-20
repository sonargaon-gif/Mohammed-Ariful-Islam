package com.freeconnect.app.ui.navigation

import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.freeconnect.app.ui.screens.AboutScreen
import com.freeconnect.app.ui.screens.BatterySavingScreen
import com.freeconnect.app.ui.screens.ChatScreen
import com.freeconnect.app.ui.screens.ConnectionScreen
import com.freeconnect.app.ui.screens.ContactsScreen
import com.freeconnect.app.ui.screens.EmergencySosScreen
import com.freeconnect.app.ui.screens.FileManagerScreen
import com.freeconnect.app.ui.screens.GroupChatScreen
import com.freeconnect.app.ui.screens.HomeScreen
import com.freeconnect.app.ui.screens.MessageHistoryScreen
import com.freeconnect.app.ui.screens.NearbyDevicesScreen
import com.freeconnect.app.ui.screens.NetworkMapScreen
import com.freeconnect.app.ui.screens.NetworkStatusScreen
import com.freeconnect.app.ui.screens.OnboardingScreen
import com.freeconnect.app.ui.screens.PermissionScreen
import com.freeconnect.app.ui.screens.PrivacyScreen
import com.freeconnect.app.ui.screens.ProfileScreen
import com.freeconnect.app.ui.screens.QrScannerScreen
import com.freeconnect.app.ui.screens.SettingsScreen
import com.freeconnect.app.ui.screens.VoiceMessageScreen
import com.freeconnect.app.ui.screens.WelcomeScreen
import com.freeconnect.app.ui.viewmodel.FreeConnectViewModel

object Routes {
    const val WELCOME = "welcome"
    const val ONBOARDING = "onboarding"
    const val PERMISSIONS = "permissions"
    const val HOME = "home"
    const val CHAT = "chat/{peerNodeId}"
    const val GROUP_CHAT = "group_chat"
    const val NEARBY = "nearby"
    const val VOICE = "voice"
    const val FILES = "files"
    const val CONTACTS = "contacts"
    const val QR_SCANNER = "qr_scanner"
    const val EMERGENCY_SOS = "emergency_sos"
    const val NETWORK_MAP = "network_map"
    const val CONNECTIONS = "connections"
    const val HISTORY = "history"
    const val PROFILE = "profile"
    const val SETTINGS = "settings"
    const val PRIVACY = "privacy"
    const val BATTERY = "battery"
    const val ABOUT = "about"
    const val NETWORK_STATUS = "network_status"

    fun chatRoute(peerNodeId: String) = "chat/$peerNodeId"
}

@Composable
fun FreeConnectNavHost(viewModel: FreeConnectViewModel) {
    val navController = rememberNavController()
    val profile by viewModel.localProfile.collectAsState()

    val startDestination = when {
        profile?.onboardingCompleted != true -> Routes.WELCOME
        !viewModel.hasPermissions() -> Routes.PERMISSIONS
        else -> Routes.HOME
    }

    NavHost(
        navController = navController,
        startDestination = startDestination,
        enterTransition = { fadeIn() },
        exitTransition = { fadeOut() }
    ) {
        composable(Routes.WELCOME) {
            WelcomeScreen(onStartConnecting = { navController.navigate(Routes.ONBOARDING) })
        }
        composable(Routes.ONBOARDING) {
            OnboardingScreen(onFinish = { navController.navigate(Routes.PERMISSIONS) })
        }
        composable(Routes.PERMISSIONS) {
            PermissionScreen(
                onAllGranted = {
                    viewModel.startOfflineBluetoothServices()
                    navController.navigate(Routes.HOME) {
                        popUpTo(Routes.WELCOME) { inclusive = true }
                    }
                }
            )
        }
        composable(Routes.HOME) {
            HomeScreen(
                viewModel = viewModel,
                onOpenChat = { peerNodeId -> navController.navigate(Routes.chatRoute(peerNodeId)) },
                onOpenNearby = { navController.navigate(Routes.NEARBY) },
                onOpenConnections = { navController.navigate(Routes.CONNECTIONS) },
                onOpenHistory = { navController.navigate(Routes.HISTORY) },
                onOpenNetwork = { navController.navigate(Routes.NETWORK_MAP) },
                onOpenProfile = { navController.navigate(Routes.PROFILE) },
                onOpenSettings = { navController.navigate(Routes.SETTINGS) }
            )
        }
        composable(
            route = Routes.CHAT,
            arguments = listOf(navArgument("peerNodeId") { type = NavType.StringType })
        ) { entry ->
            val peerNodeId = entry.arguments?.getString("peerNodeId") ?: return@composable
            ChatScreen(peerNodeId = peerNodeId, viewModel = viewModel, onBack = { navController.popBackStack() })
        }
        composable(Routes.GROUP_CHAT) {
            GroupChatScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
        }
        composable(Routes.NEARBY) {
            NearbyDevicesScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onOpenConnections = { navController.navigate(Routes.CONNECTIONS) },
                onOpenChat = { peerNodeId -> navController.navigate(Routes.chatRoute(peerNodeId)) }
            )
        }
        composable(Routes.VOICE) { VoiceMessageScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.FILES) { FileManagerScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.CONTACTS) {
            ContactsScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onOpenChat = { peerNodeId -> navController.navigate(Routes.chatRoute(peerNodeId)) },
                onOpenQr = { navController.navigate(Routes.QR_SCANNER) }
            )
        }
        composable(Routes.QR_SCANNER) { QrScannerScreen(viewModel = viewModel, onBack = { navController.popBackStack() }) }
        composable(Routes.EMERGENCY_SOS) { EmergencySosScreen(viewModel = viewModel, onBack = { navController.popBackStack() }) }
        composable(Routes.NETWORK_MAP) { NetworkMapScreen(viewModel = viewModel, onBack = { navController.popBackStack() }) }
        composable(Routes.CONNECTIONS) {
            ConnectionScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onOpenChat = { peerNodeId -> navController.navigate(Routes.chatRoute(peerNodeId)) }
            )
        }
        composable(Routes.HISTORY) {
            MessageHistoryScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onOpenChat = { peerNodeId -> navController.navigate(Routes.chatRoute(peerNodeId)) }
            )
        }
        composable(Routes.PROFILE) {
            ProfileScreen(viewModel = viewModel, isOnboarding = false, onBack = { navController.popBackStack() })
        }
        composable(Routes.SETTINGS) { SettingsScreen(viewModel = viewModel, onBack = { navController.popBackStack() }) }
        composable(Routes.PRIVACY) { PrivacyScreen(viewModel = viewModel, onBack = { navController.popBackStack() }) }
        composable(Routes.BATTERY) { BatterySavingScreen(viewModel = viewModel, onBack = { navController.popBackStack() }) }
        composable(Routes.ABOUT) { AboutScreen(onBack = { navController.popBackStack() }) }
        composable(Routes.NETWORK_STATUS) { NetworkStatusScreen(viewModel = viewModel, onBack = { navController.popBackStack() }) }
    }
}
