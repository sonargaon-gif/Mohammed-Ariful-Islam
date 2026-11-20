package com.freeconnect.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.freeconnect.offline.FreeConnectWebViewBridge

/**
 * Native Android Entry Activity hosting the locally bundled FreeConnect offline UI
 * and bridging both Bluetooth Low Energy (BLE) and high-speed Wi-Fi Direct (P2P).
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var offlineBridge: FreeConnectWebViewBridge

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        // Runtime Bluetooth & Wi-Fi Direct permissions handled; user can trigger discovery immediately
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    // Grant Camera (QR scanning) and Microphone (offline voice notes) inside local WebView
                    request.grant(request.resources)
                }
            }
        }

        offlineBridge = FreeConnectWebViewBridge(applicationContext, webView)
        webView.addJavascriptInterface(offlineBridge, "FreeConnectNative")

        setContentView(webView)
        requestOfflineRadioPermissions()

        // Loads locally bundled `dist/index.html` from android_asset/dist/ with zero internet dependency
        webView.loadUrl("file:///android_asset/dist/index.html")
    }

    private fun requestOfflineRadioPermissions() {
        val required = mutableListOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            required.add(Manifest.permission.NEARBY_WIFI_DEVICES)
            required.add(Manifest.permission.BLUETOOTH_SCAN)
            required.add(Manifest.permission.BLUETOOTH_CONNECT)
            required.add(Manifest.permission.BLUETOOTH_ADVERTISE)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            required.add(Manifest.permission.BLUETOOTH_SCAN)
            required.add(Manifest.permission.BLUETOOTH_CONNECT)
            required.add(Manifest.permission.BLUETOOTH_ADVERTISE)
            required.add(Manifest.permission.ACCESS_FINE_LOCATION)
        } else {
            required.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }

        val missing = required.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            permissionLauncher.launch(missing.toTypedArray())
        }
    }

    override fun onDestroy() {
        offlineBridge.destroy()
        webView.destroy()
        super.onDestroy()
    }
}
