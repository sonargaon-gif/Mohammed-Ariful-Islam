import Foundation
import MultipeerConnectivity
import UIKit

/// FreeConnect Apple MultipeerConnectivity Manager (iPhone ↔ iPhone Offline P2P)
///
/// Uses Apple's native Bluetooth + Peer-to-Peer Wi-Fi (AWDL) stack without any router,
/// cellular data, or internet connection.
///
/// Implements explicit User-Approved Handshake:
///   1. User 1 taps "Find Nearby iPhones" and selects User 2's iPhone.
///   2. User 2 receives `onConnectionRequest` ("Request Received") with Accept / Reject.
///   3. Only when User 2 taps Accept does `invitationHandler(true, session)` establish
///      the encrypted MCSession link.
///   4. Supports automatic reconnection if an accepted link drops unexpectedly.
final class FreeConnectMultipeerManager: NSObject {

    // Must match Info.plist NSBonjourServices: "_freeconnect._tcp" & "_freeconnect._udp"
    private let serviceType = "freeconnect"

    var onPeerDiscovered: ((_ peerId: String, _ name: String, _ deviceCode: String?, _ connected: Bool) -> Void)?
    var onPeerLost: ((_ peerId: String) -> Void)?
    var onConnectionRequest: ((_ peerId: String, _ peerName: String, _ deviceCode: String?) -> Void)?
    var onConnectionStateChanged: ((_ peerId: String, _ peerName: String?, _ state: String, _ message: String?) -> Void)?
    var onPacketReceived: ((_ peerId: String, _ packetJson: String) -> Void)?
    var onScanStateChanged: ((_ state: String, _ message: String?) -> Void)?
    var onError: ((_ message: String) -> Void)?

    private var myPeerID: MCPeerID
    private var session: MCSession
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?

    private var discoveredPeers: [String: MCPeerID] = [:]
    private var peerDeviceCodes: [String: String] = [:]
    private var pendingInvitations: [String: (Bool, MCSession?) -> Void] = [:]
    private var manuallyDisconnectedPeers: Set<String> = []
    private var reconnectTimers: [String: Timer] = [:]
    private var localDeviceId: String = "FC-IOS"

    init(displayName: String = UIDevice.current.name, deviceId: String = "FC-IOS") {
        let safeName = String(displayName.prefix(40))
        self.localDeviceId = deviceId
        self.myPeerID = MCPeerID(displayName: safeName)
        self.session = MCSession(peer: myPeerID, securityIdentity: nil, encryptionPreference: .required)
        super.init()
        self.session.delegate = self
        rebuildDiscoveryServices(deviceId: deviceId)
    }

    func updateLocalIdentity(deviceId: String, displayName: String) {
        localDeviceId = deviceId
        stopDiscovery()
        session.disconnect()
        let safeName = String(displayName.prefix(40))
        myPeerID = MCPeerID(displayName: safeName)
        session = MCSession(peer: myPeerID, securityIdentity: nil, encryptionPreference: .required)
        session.delegate = self
        rebuildDiscoveryServices(deviceId: deviceId)
    }

    private func rebuildDiscoveryServices(deviceId: String) {
        advertiser?.stopAdvertisingPeer()
        browser?.stopBrowsingForPeers()

        advertiser = MCNearbyServiceAdvertiser(
            peer: myPeerID,
            discoveryInfo: ["deviceId": deviceId, "platform": "ios"],
            serviceType: serviceType
        )
        advertiser?.delegate = self

        browser = MCNearbyServiceBrowser(peer: myPeerID, serviceType: serviceType)
        browser?.delegate = self
    }

    func startDiscovery() {
        advertiser?.startAdvertisingPeer()
        browser?.startBrowsingForPeers()
        onScanStateChanged?("searching", "Searching nearby iPhones via Apple MultipeerConnectivity (Bluetooth + AWDL)...")
    }

    func stopDiscovery() {
        browser?.stopBrowsingForPeers()
        onScanStateChanged?("idle", nil)
    }

    func connectPeer(peerId: String) {
        manuallyDisconnectedPeers.remove(peerId)
        reconnectTimers[peerId]?.invalidate()
        reconnectTimers.removeValue(forKey: peerId)

        guard let target = discoveredPeers[peerId] else {
            onError?("iPhone peer \(peerId) is not currently discovered. Tap Find Nearby iPhones first.")
            return
        }

        let contextData = localDeviceId.data(using: .utf8)
        onConnectionStateChanged?(
            peerId,
            target.displayName,
            "connecting",
            "Connection request sent to \(target.displayName). Waiting for acceptance..."
        )
        browser?.invitePeer(target, to: session, withContext: contextData, timeout: 25)
    }

    /// Invoked when User 2 taps Accept or Reject on an incoming connection request
    func respondToConnectionRequest(peerId: String, accept: Bool) {
        guard let handler = pendingInvitations.removeValue(forKey: peerId) else {
            return
        }
        if accept {
            manuallyDisconnectedPeers.remove(peerId)
            onConnectionStateChanged?(peerId, peerId, "connecting", "Request accepted. Establishing encrypted iPhone-to-iPhone link...")
            handler(true, session)
        } else {
            handler(false, nil)
            onConnectionStateChanged?(peerId, peerId, "disconnected", "Connection request rejected.")
        }
    }

    func disconnectPeer(peerId: String) {
        manuallyDisconnectedPeers.insert(peerId)
        reconnectTimers[peerId]?.invalidate()
        reconnectTimers.removeValue(forKey: peerId)

        if let pending = pendingInvitations.removeValue(forKey: peerId) {
            pending(false, nil)
        }

        if session.connectedPeers.contains(where: { $0.displayName == peerId }) {
            session.disconnect()
            onConnectionStateChanged?(peerId, peerId, "disconnected", "Disconnected by user.")
        }
    }

    @discardableResult
    func sendPacket(peerId: String, packetJson: String) -> Bool {
        guard let target = session.connectedPeers.first(where: { $0.displayName == peerId }),
              let data = packetJson.data(using: .utf8) else {
            return false
        }
        do {
            try session.send(data, toPeers: [target], with: .reliable)
            return true
        } catch {
            onError?("Multipeer send failed: \(error.localizedDescription)")
            return false
        }
    }

    private func scheduleAutoReconnect(peerId: String, peer: MCPeerID) {
        guard !manuallyDisconnectedPeers.contains(peerId) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.reconnectTimers[peerId]?.invalidate()
            self?.reconnectTimers[peerId] = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { [weak self] _ in
                guard let self,
                      !self.manuallyDisconnectedPeers.contains(peerId),
                      self.discoveredPeers[peerId] != nil else { return }
                self.onConnectionStateChanged?(peerId, peer.displayName, "connecting", "Reconnecting to \(peer.displayName)...")
                self.browser?.invitePeer(peer, to: self.session, withContext: self.localDeviceId.data(using: .utf8), timeout: 15)
            }
        }
    }
}

extension FreeConnectMultipeerManager: MCNearbyServiceAdvertiserDelegate {
    func advertiser(
        _ advertiser: MCNearbyServiceAdvertiser,
        didReceiveInvitationFromPeer peerID: MCPeerID,
        withContext context: Data?,
        invitationHandler: @escaping (Bool, MCSession?) -> Void
    ) {
        let key = peerID.displayName
        discoveredPeers[key] = peerID
        let remoteCode = context.flatMap { String(data: $0, encoding: .utf8) } ?? peerDeviceCodes[key]
        if let remoteCode { peerDeviceCodes[key] = remoteCode }

        // Hold invitation until User 2 explicitly taps Accept or Reject in FreeConnect UI
        pendingInvitations[key] = invitationHandler
        onConnectionStateChanged?(key, peerID.displayName, "request_received", "\(peerID.displayName) wants to connect.")
        onConnectionRequest?(key, peerID.displayName, remoteCode)
    }

    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
        onError?("Multipeer advertising error: \(error.localizedDescription)")
    }
}

extension FreeConnectMultipeerManager: MCNearbyServiceBrowserDelegate {
    func browser(
        _ browser: MCNearbyServiceBrowser,
        foundPeer peerID: MCPeerID,
        withDiscoveryInfo info: [String: String]?
    ) {
        let key = peerID.displayName
        discoveredPeers[key] = peerID
        let code = info?["deviceId"]
        if let code { peerDeviceCodes[key] = code }
        let isConnected = session.connectedPeers.contains(peerID)
        onPeerDiscovered?(key, peerID.displayName, code, isConnected)
    }

    func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        let key = peerID.displayName
        discoveredPeers.removeValue(forKey: key)
        onPeerLost?(key)
    }

    func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
        onScanStateChanged?("idle", "Discovery failed.")
        onError?("Multipeer discovery error: \(error.localizedDescription)")
    }
}

extension FreeConnectMultipeerManager: MCSessionDelegate {
    func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        let key = peerID.displayName
        switch state {
        case .connecting:
            onConnectionStateChanged?(key, peerID.displayName, "connecting", "Establishing encrypted iPhone-to-iPhone link...")
        case .connected:
            reconnectTimers[key]?.invalidate()
            reconnectTimers.removeValue(forKey: key)
            onConnectionStateChanged?(key, peerID.displayName, "connected", "Connected to \(peerID.displayName) via iOS Multipeer P2P.")
        case .notConnected:
            let wasManual = manuallyDisconnectedPeers.contains(key)
            let msg = wasManual
                ? "Disconnected."
                : "iPhone connection lost. Trying to reconnect when nearby..."
            onConnectionStateChanged?(key, peerID.displayName, "disconnected", msg)
            if !wasManual {
                scheduleAutoReconnect(peerId: key, peer: peerID)
            }
        @unknown default:
            break
        }
    }

    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        guard let json = String(data: data, encoding: .utf8) else { return }
        onPacketReceived?(peerID.displayName, json)
    }

    func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}
