import UIKit
import WebKit

/// Native iOS Container hosting the FreeConnect UI inside WKWebView
/// and wiring CoreBluetooth BLE (iPhone ↔ Android & iPhone ↔ iPhone) plus
/// MultipeerConnectivity (iPhone ↔ iPhone high-speed) directly to `src/utils/nativeOfflineBridge.ts`.
final class FreeConnectWebViewController: UIViewController, WKScriptMessageHandler {

    private var webView: WKWebView!
    private let bleManager = FreeConnectBLEManager()
    private let multipeerManager = FreeConnectMultipeerManager()

    /// Track which native transport owns each connected peerId
    private var peerTransports: [String: String] = [:]

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.012, green: 0.043, blue: 0.106, alpha: 1.0)

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let userContentController = WKUserContentController()
        userContentController.add(self, name: "freeConnectNative")

        // Expose native platform descriptor before page scripts boot
        let platformScript = WKUserScript(
            source: """
            window.__FREECONNECT_NATIVE_PLATFORM__ = {
              platform: 'ios_native',
              transports: ['native_ble', 'native_wifi_direct']
            };
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        userContentController.addUserScript(platformScript)
        config.userContentController = userContentController

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        view.addSubview(webView)

        bindNativeCallbacks()
        loadBundledFreeConnectApp()
    }

    private func loadBundledFreeConnectApp() {
        // Load locally bundled `dist/index.html` for 100% offline launch with zero internet needed
        if let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "dist") {
            webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
        }
    }

    private func bindNativeCallbacks() {
        // CoreBluetooth Dual-Role (Cross-platform iPhone ↔ Android & iPhone ↔ iPhone)
        bleManager.onPeerDiscovered = { [weak self] peerId, name, deviceCode, rssi, connected in
            self?.peerTransports[peerId] = "native_ble"
            self?.emitEvent([
                "type": "peer_discovered",
                "peer": [
                    "id": peerId,
                    "name": name,
                    "deviceCode": deviceCode ?? NSNull(),
                    "transport": "native_ble",
                    "rssi": rssi,
                    "platform": "unknown",
                    "connected": connected
                ]
            ])
        }

        bleManager.onPeerLost = { [weak self] peerId in
            self?.emitEvent([
                "type": "peer_lost",
                "peerId": peerId
            ])
        }

        bleManager.onConnectionRequest = { [weak self] peerId, peerName, deviceCode in
            self?.peerTransports[peerId] = "native_ble"
            self?.emitEvent([
                "type": "connection_request",
                "peerId": peerId,
                "peerName": peerName,
                "deviceCode": deviceCode ?? NSNull(),
                "platform": "unknown",
                "transport": "native_ble"
            ])
        }

        bleManager.onBluetoothStateChanged = { [weak self] enabled, hwOn, perm, discoverable, message in
            self?.emitEvent([
                "type": "bluetooth_state",
                "enabled": enabled,
                "hardwarePoweredOn": hwOn,
                "permissionState": perm,
                "discoverable": discoverable,
                "message": message ?? NSNull()
            ])
        }

        bleManager.onConnectionStateChanged = { [weak self] peerId, peerName, state, message in
            self?.peerTransports[peerId] = "native_ble"
            self?.emitEvent([
                "type": "connection_state",
                "peerId": peerId,
                "peerName": peerName ?? NSNull(),
                "transport": "native_ble",
                "state": state,
                "message": message ?? NSNull()
            ])
        }

        bleManager.onPacketReceived = { [weak self] peerId, packetJson in
            self?.emitEvent([
                "type": "packet_received",
                "peerId": peerId,
                "transport": "native_ble",
                "packetJson": packetJson
            ])
        }

        bleManager.onScanStateChanged = { [weak self] state, message in
            self?.emitEvent([
                "type": "scan_state",
                "state": state,
                "message": message ?? NSNull()
            ])
        }

        bleManager.onError = { [weak self] message in
            self?.emitEvent(["type": "error", "message": message])
        }

        // Apple MultipeerConnectivity (High-Speed iPhone ↔ iPhone)
        multipeerManager.onPeerDiscovered = { [weak self] peerId, name, deviceCode, connected in
            self?.peerTransports[peerId] = "native_wifi_direct"
            self?.emitEvent([
                "type": "peer_discovered",
                "peer": [
                    "id": peerId,
                    "name": name,
                    "deviceCode": deviceCode ?? NSNull(),
                    "transport": "native_wifi_direct",
                    "platform": "ios",
                    "connected": connected
                ]
            ])
        }

        multipeerManager.onPeerLost = { [weak self] peerId in
            self?.emitEvent([
                "type": "peer_lost",
                "peerId": peerId
            ])
        }

        multipeerManager.onConnectionRequest = { [weak self] peerId, peerName, deviceCode in
            self?.peerTransports[peerId] = "native_wifi_direct"
            self?.emitEvent([
                "type": "connection_request",
                "peerId": peerId,
                "peerName": peerName,
                "deviceCode": deviceCode ?? NSNull(),
                "platform": "ios",
                "transport": "native_wifi_direct"
            ])
        }

        multipeerManager.onConnectionStateChanged = { [weak self] peerId, peerName, state, message in
            self?.peerTransports[peerId] = "native_wifi_direct"
            self?.emitEvent([
                "type": "connection_state",
                "peerId": peerId,
                "peerName": peerName ?? NSNull(),
                "transport": "native_wifi_direct",
                "state": state,
                "message": message ?? NSNull()
            ])
        }

        multipeerManager.onPacketReceived = { [weak self] peerId, packetJson in
            self?.emitEvent([
                "type": "packet_received",
                "peerId": peerId,
                "transport": "native_wifi_direct",
                "packetJson": packetJson
            ])
        }

        multipeerManager.onScanStateChanged = { [weak self] state, message in
            self?.emitEvent([
                "type": "scan_state",
                "state": state,
                "message": message ?? NSNull()
            ])
        }

        multipeerManager.onError = { [weak self] message in
            self?.emitEvent(["type": "error", "message": message])
        }
    }

    // MARK: - JS -> Native Commands (from src/utils/nativeOfflineBridge.ts)

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "freeConnectNative",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "setLocalIdentity":
            if let identity = body["identity"] as? [String: Any],
               let deviceId = identity["deviceId"] as? String,
               let name = identity["name"] as? String {
                bleManager.updateLocalIdentity(deviceId: deviceId, displayName: name)
                multipeerManager.updateLocalIdentity(deviceId: deviceId, displayName: name)
            }

        case "startDiscovery":
            let transport = (body["transport"] as? String) ?? "all"
            if transport == "all" || transport == "native_ble" {
                bleManager.startDiscovery()
            }
            if transport == "all" || transport == "native_wifi_direct" {
                multipeerManager.startDiscovery()
            }

        case "stopDiscovery":
            bleManager.stopDiscovery()
            multipeerManager.stopDiscovery()

        case "connectPeer":
            guard let peerId = body["peerId"] as? String else { return }
            let transport = (body["transport"] as? String) ?? peerTransports[peerId] ?? "native_ble"
            if transport == "native_wifi_direct" {
                multipeerManager.connectPeer(peerId: peerId)
            } else {
                bleManager.connectPeer(peerId: peerId)
            }

        case "setBluetoothEnabled":
            let enabled = (body["enabled"] as? Bool) ?? false
            bleManager.setBluetoothEnabled(enabled)
            if !enabled {
                multipeerManager.stopDiscovery()
            }

        case "requestBluetoothPermission":
            bleManager.reportCurrentBluetoothState()

        case "respondConnectionRequest":
            guard let peerId = body["peerId"] as? String,
                  let accept = body["accept"] as? Bool else { return }
            let transport = (body["transport"] as? String) ?? peerTransports[peerId] ?? "native_wifi_direct"
            if transport == "native_ble" {
                bleManager.respondToConnectionRequest(peerId: peerId, accept: accept)
            } else {
                multipeerManager.respondToConnectionRequest(peerId: peerId, accept: accept)
            }

        case "startCodeHost":
            // Advertise temporary code commitment alongside active Multipeer & BLE discovery
            multipeerManager.startDiscovery()
            bleManager.startDiscovery()

        case "cancelCodeHost":
            break

        case "sendCodeJoinRequest":
            guard let peerId = body["peerId"] as? String else { return }
            let transport = (body["transport"] as? String) ?? peerTransports[peerId] ?? "native_wifi_direct"
            if transport == "native_wifi_direct" {
                multipeerManager.connectPeer(peerId: peerId)
            } else {
                bleManager.connectPeer(peerId: peerId)
            }

        case "disconnectPeer":
            guard let peerId = body["peerId"] as? String else { return }
            bleManager.disconnectPeer(peerId: peerId)
            multipeerManager.disconnectPeer(peerId: peerId)

        case "sendPacket":
            guard let peerId = body["peerId"] as? String,
                  let packetJson = body["packetJson"] as? String else { return }
            let transport = peerTransports[peerId] ?? "native_ble"
            let ok = transport == "native_wifi_direct"
                ? multipeerManager.sendPacket(peerId: peerId, packetJson: packetJson)
                : bleManager.sendPacket(peerId: peerId, packetJson: packetJson)
            if !ok {
                emitEvent([
                    "type": "error",
                    "message": "Failed to transmit packet over \(transport) to peer \(peerId)."
                ])
            }

        default:
            break
        }
    }

    // MARK: - Native -> JS Event Dispatcher

    private func emitEvent(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(
                "window.__freeConnectNativeEvent && window.__freeConnectNativeEvent(\(json));",
                completionHandler: nil
            )
        }
    }
}
