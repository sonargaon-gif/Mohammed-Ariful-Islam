import Foundation
import CoreBluetooth

/// FreeConnect Dual-Role CoreBluetooth Manager (Central + Peripheral)
///
/// Enables true 100% offline Bluetooth Low Energy communication between:
///   • iPhone ↔ iPhone
///   • iPhone ↔ Android (using identical GATT UUIDs & FC1 chunk framing)
///   • iPhone ↔ Desktop Chrome (Web Bluetooth Central connecting to iPhone Peripheral)
///
/// Zero Wi-Fi, zero cellular data, zero internet servers required.
final class FreeConnectBLEManager: NSObject {

    // Shared Cross-Platform FreeConnect GATT UUIDs (identical in Android Kotlin & Web Bluetooth)
    static let serviceUUID = CBUUID(string: "F000FC01-0451-4000-B000-000000000000")
    static let txCharacteristicUUID = CBUUID(string: "F000FC02-0451-4000-B000-000000000000") // Central -> Peripheral Write
    static let rxCharacteristicUUID = CBUUID(string: "F000FC03-0451-4000-B000-000000000000") // Peripheral -> Central Notify

    private let maxChunkPayloadBytes = 140

    // Callbacks bridged to FreeConnectWebViewBridge
    var onPeerDiscovered: ((_ peerId: String, _ name: String, _ deviceCode: String?, _ rssi: Int, _ connected: Bool) -> Void)?
    var onPeerLost: ((_ peerId: String) -> Void)?
    var onConnectionRequest: ((_ peerId: String, _ peerName: String, _ deviceCode: String?) -> Void)?
    var onConnectionStateChanged: ((_ peerId: String, _ peerName: String?, _ state: String, _ message: String?) -> Void)?
    var onBluetoothStateChanged: ((_ enabled: Bool, _ hardwarePoweredOn: Bool, _ permissionState: String, _ discoverable: Bool, _ message: String?) -> Void)?
    var onPacketReceived: ((_ peerId: String, _ packetJson: String) -> Void)?
    var onScanStateChanged: ((_ state: String, _ message: String?) -> Void)?
    var onError: ((_ message: String) -> Void)?

    private var centralManager: CBCentralManager!
    private var peripheralManager: CBPeripheralManager!

    private var localDeviceId: String = "FC-IOS"
    private var localDisplayName: String = "FreeConnect iOS"

    // Central role state (outgoing connections to Android or iPhone peripherals)
    private var discoveredPeripherals: [String: CBPeripheral] = [:]
    private var connectedPeripherals: [String: CBPeripheral] = [:]
    private var peripheralTxCharacteristics: [String: CBCharacteristic] = [:]
    private var manuallyDisconnectedPeers: Set<String> = []
    private var reconnectTimers: [String: Timer] = [:]

    // Peripheral role state (incoming connections require explicit user approval)
    private var rxCharacteristic: CBMutableCharacteristic?
    private var pendingApprovalCentrals: [String: CBCentral] = [:]
    private var subscribedCentrals: [String: CBCentral] = [:]
    private var pendingNotificationQueue: [(central: CBCentral, data: Data)] = []

    // FC1 chunk reassembly buffers keyed by "<peerId>:<packetId>"
    private struct ChunkBuffer {
        let total: Int
        var parts: [Int: String]
        var updatedAt: Date
    }
    private var chunkBuffers: [String: ChunkBuffer] = [:]
    private var isScanningRequested = false
    private var isUserBluetoothEnabled = false

    override init() {
        super.init()
        let queue = DispatchQueue(label: "com.freeconnect.ble.queue", qos: .userInitiated)
        centralManager = CBCentralManager(delegate: self, queue: queue)
        peripheralManager = CBPeripheralManager(delegate: self, queue: queue)
    }

    func updateLocalIdentity(deviceId: String, displayName: String) {
        localDeviceId = deviceId
        localDisplayName = displayName
        if isUserBluetoothEnabled && peripheralManager.state == .poweredOn {
            startAdvertising()
        }
    }

    func setBluetoothEnabled(_ enabled: Bool) {
        isUserBluetoothEnabled = enabled
        if !enabled {
            stopDiscovery()
            if peripheralManager.isAdvertising {
                peripheralManager.stopAdvertising()
            }
            for peerId in Array(connectedPeripherals.keys) {
                disconnectPeer(peerId: peerId)
            }
            pendingApprovalCentrals.removeAll()
            subscribedCentrals.removeAll()
            emitBluetoothState(message: "Bluetooth messaging disabled in FreeConnect Settings.")
            return
        }

        if centralManager.state == .poweredOn {
            if peripheralManager.state == .poweredOn {
                setupGattServiceAndAdvertise()
            }
            emitBluetoothState(message: "CoreBluetooth BLE active and discoverable.")
        } else {
            emitBluetoothState(message: nil)
        }
    }

    func reportCurrentBluetoothState() {
        emitBluetoothState(message: nil)
    }

    private func emitBluetoothState(message: String?) {
        let auth: String
        if #available(iOS 13.1, *) {
            switch CBManager.authorization {
            case .allowedAlways: auth = "granted"
            case .denied, .restricted: auth = "denied"
            default: auth = "prompt"
            }
        } else {
            auth = centralManager.state == .unauthorized ? "denied" : "granted"
        }
        let hwOn = centralManager.state == .poweredOn
        let active = isUserBluetoothEnabled && hwOn && auth == "granted"
        let discoverable = active && peripheralManager.state == .poweredOn
        let resolvedMsg = message ?? (
            auth == "denied"
                ? "Bluetooth permission denied. Allow Bluetooth for FreeConnect in iOS Settings."
                : !hwOn
                    ? "Bluetooth radio is turned off in iOS Control Center / Settings."
                    : active
                        ? "CoreBluetooth BLE active and ready to discover nearby devices."
                        : "Bluetooth is turned off in FreeConnect Settings."
        )
        onBluetoothStateChanged?(active, hwOn, auth, discoverable, resolvedMsg)
    }

    func startDiscovery() {
        guard isUserBluetoothEnabled else {
            onError?("Turn Bluetooth ON in Settings before scanning for nearby devices.")
            return
        }
        isScanningRequested = true
        guard centralManager.state == .poweredOn else {
            onError?("Bluetooth is not powered on. Please enable Bluetooth in iOS Settings.")
            emitBluetoothState(message: nil)
            return
        }
        onScanStateChanged?("searching", "Scanning nearby BLE devices (iPhone & Android)...")
        centralManager.scanForPeripherals(
            withServices: [Self.serviceUUID],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
        if peripheralManager.state == .poweredOn {
            startAdvertising()
        }
    }

    func stopDiscovery() {
        isScanningRequested = false
        if centralManager.isScanning {
            centralManager.stopScan()
        }
        onScanStateChanged?("idle", nil)
    }

    func respondToConnectionRequest(peerId: String, accept: Bool) {
        guard let central = pendingApprovalCentrals.removeValue(forKey: peerId) else {
            return
        }
        if accept {
            subscribedCentrals[peerId] = central
            onConnectionStateChanged?(
                peerId,
                "Nearby BLE Peer",
                "connected",
                "Connection accepted over Native CoreBluetooth BLE."
            )
        } else {
            subscribedCentrals.removeValue(forKey: peerId)
            onConnectionStateChanged?(
                peerId,
                "Nearby BLE Peer",
                "failed",
                "Connection Rejected."
            )
        }
    }

    func connectPeer(peerId: String) {
        manuallyDisconnectedPeers.remove(peerId)
        reconnectTimers[peerId]?.invalidate()
        reconnectTimers.removeValue(forKey: peerId)

        guard let peripheral = discoveredPeripherals[peerId] else {
            onError?("BLE device \(peerId) is no longer nearby. Scan again to rediscover it.")
            return
        }
        onConnectionStateChanged?(peerId, peripheral.name, "connecting", "Connecting over CoreBluetooth BLE...")
        centralManager.connect(peripheral, options: [
            CBConnectPeripheralOptionNotifyOnConnectionKey: true,
            CBConnectPeripheralOptionNotifyOnDisconnectionKey: true
        ])
    }

    func disconnectPeer(peerId: String) {
        manuallyDisconnectedPeers.insert(peerId)
        reconnectTimers[peerId]?.invalidate()
        reconnectTimers.removeValue(forKey: peerId)

        if let peripheral = connectedPeripherals[peerId] ?? discoveredPeripherals[peerId] {
            centralManager.cancelPeripheralConnection(peripheral)
            connectedPeripherals.removeValue(forKey: peerId)
            peripheralTxCharacteristics.removeValue(forKey: peerId)
        }
        subscribedCentrals.removeValue(forKey: peerId)
        onConnectionStateChanged?(peerId, nil, "disconnected", "Disconnected by user.")
    }

    @discardableResult
    func sendPacket(peerId: String, packetJson: String) -> Bool {
        let frames = buildChunkFrames(packetJson: packetJson)

        // Path A: We are Central connected to a remote Peripheral (Android or iPhone)
        if let peripheral = connectedPeripherals[peerId],
           let txChar = peripheralTxCharacteristics[peerId] {
            let writeType: CBCharacteristicWriteType = txChar.properties.contains(.writeWithoutResponse)
                ? .withoutResponse
                : .withResponse
            for frame in frames {
                guard let data = frame.data(using: .utf8) else { continue }
                peripheral.writeValue(data, for: txChar, type: writeType)
            }
            return true
        }

        // Path B: We are Peripheral with a subscribed remote Central (Android or iPhone)
        if let central = subscribedCentrals[peerId], let rxChar = rxCharacteristic {
            for frame in frames {
                guard let data = frame.data(using: .utf8) else { continue }
                let sent = peripheralManager.updateValue(data, for: rxChar, onSubscribedCentrals: [central])
                if !sent {
                    pendingNotificationQueue.append((central: central, data: data))
                }
            }
            return true
        }

        return false
    }

    // MARK: - GATT Server Advertising

    private func setupGattServiceAndAdvertise() {
        let tx = CBMutableCharacteristic(
            type: Self.txCharacteristicUUID,
            properties: [.write, .writeWithoutResponse],
            value: nil,
            permissions: [.writeable]
        )
        let rx = CBMutableCharacteristic(
            type: Self.rxCharacteristicUUID,
            properties: [.notify, .read],
            value: nil,
            permissions: [.readable]
        )
        self.rxCharacteristic = rx

        let service = CBMutableService(type: Self.serviceUUID, primary: true)
        service.characteristics = [tx, rx]
        peripheralManager.removeAllServices()
        peripheralManager.add(service)
        startAdvertising()
    }

    private func startAdvertising() {
        if peripheralManager.isAdvertising {
            peripheralManager.stopAdvertising()
        }
        // Keep local name short (<= 18 bytes) so iOS includes the 128-bit Service UUID cleanly
        let advertisedName = "FC-\(localDeviceId.suffix(8))"
        peripheralManager.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [Self.serviceUUID],
            CBAdvertisementDataLocalNameKey: advertisedName
        ])
    }

    // MARK: - FC1 Chunk Framing & Reassembly (matches webBluetoothContact.ts & Android Kotlin)

    private func buildChunkFrames(packetJson: String) -> [String] {
        let packetId = String(UUID().uuidString.prefix(8))
        let utf8 = Array(packetJson.utf8)
        var slices: [String] = []
        var offset = 0

        while offset < utf8.count {
            var end = min(offset + maxChunkPayloadBytes, utf8.count)
            // Avoid splitting multi-byte UTF-8 characters mid-codepoint
            while end < utf8.count && (utf8[end] & 0xC0) == 0x80 {
                end -= 1
            }
            if end <= offset {
                end = min(offset + maxChunkPayloadBytes, utf8.count)
            }
            let sliceBytes = utf8[offset..<end]
            slices.append(String(decoding: sliceBytes, as: UTF8.self))
            offset = end
        }
        if slices.isEmpty { slices = [""] }

        let total = slices.count
        return slices.enumerated().map { idx, slice in
            "FC1|\(packetId)|\(idx + 1)/\(total)|\(slice)"
        }
    }

    private func handleIncomingRawData(_ data: Data, fromPeerId peerId: String) {
        guard let text = String(data: data, encoding: .utf8) else { return }

        // Handle unframed JSON directly if received
        if !text.hasPrefix("FC1|") {
            onPacketReceived?(peerId, text)
            return
        }

        let parts = text.split(separator: "|", maxSplits: 3, omittingEmptySubsequences: false)
        guard parts.count == 4 else { return }
        let packetId = String(parts[1])
        let seqTotal = parts[2].split(separator: "/")
        guard seqTotal.count == 2,
              let seq = Int(seqTotal[0]),
              let total = Int(seqTotal[1]),
              seq >= 1, total >= 1 else { return }
        let payloadSlice = String(parts[3])

        let key = "\(peerId):\(packetId)"
        var buf = chunkBuffers[key] ?? ChunkBuffer(total: total, parts: [:], updatedAt: Date())
        buf.parts[seq] = payloadSlice
        buf.updatedAt = Date()
        chunkBuffers[key] = buf

        if buf.parts.count >= buf.total {
            var assembled = ""
            for i in 1...buf.total {
                guard let piece = buf.parts[i] else { return }
                assembled += piece
            }
            chunkBuffers.removeValue(forKey: key)
            onPacketReceived?(peerId, assembled)
        }
    }

    private func scheduleAutoReconnect(for peripheral: CBPeripheral) {
        let peerId = peripheral.identifier.uuidString
        guard !manuallyDisconnectedPeers.contains(peerId) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.reconnectTimers[peerId]?.invalidate()
            self?.reconnectTimers[peerId] = Timer.scheduledTimer(withTimeInterval: 2.5, repeats: false) { [weak self] _ in
                guard let self, !self.manuallyDisconnectedPeers.contains(peerId) else { return }
                self.onConnectionStateChanged?(peerId, peripheral.name, "connecting", "Auto-reconnecting BLE link...")
                self.centralManager.connect(peripheral, options: nil)
            }
        }
    }
}

// MARK: - CBCentralManagerDelegate & CBPeripheralDelegate

extension FreeConnectBLEManager: CBCentralManagerDelegate, CBPeripheralDelegate {

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            emitBluetoothState(message: nil)
            if isUserBluetoothEnabled && isScanningRequested {
                startDiscovery()
            }
        case .poweredOff:
            onScanStateChanged?("idle", "Bluetooth is turned off.")
            emitBluetoothState(message: "Bluetooth is turned off on this iPhone.")
            onError?("Bluetooth is turned off on this iPhone.")
        case .unauthorized:
            emitBluetoothState(message: "Bluetooth permission denied. Allow Bluetooth for FreeConnect in iOS Settings.")
            onError?("Bluetooth permission denied. Allow Bluetooth for FreeConnect in iOS Settings.")
        default:
            emitBluetoothState(message: nil)
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let peerId = peripheral.identifier.uuidString
        discoveredPeripherals[peerId] = peripheral
        let advertisedName = (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
            ?? peripheral.name
            ?? "FreeConnect Peer"
        let deviceCode = advertisedName.hasPrefix("FC-") ? advertisedName : nil
        let isConnected = connectedPeripherals[peerId] != nil
        onPeerDiscovered?(peerId, advertisedName, deviceCode, RSSI.intValue, isConnected)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        let peerId = peripheral.identifier.uuidString
        connectedPeripherals[peerId] = peripheral
        peripheral.delegate = self
        peripheral.discoverServices([Self.serviceUUID])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        let peerId = peripheral.identifier.uuidString
        onConnectionStateChanged?(peerId, peripheral.name, "disconnected", error?.localizedDescription ?? "BLE connection failed.")
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        let peerId = peripheral.identifier.uuidString
        connectedPeripherals.removeValue(forKey: peerId)
        peripheralTxCharacteristics.removeValue(forKey: peerId)

        let wasManual = manuallyDisconnectedPeers.contains(peerId)
        let reason = wasManual
            ? "Disconnected."
            : "BLE signal lost. Attempting automatic reconnection..."
        onConnectionStateChanged?(peerId, peripheral.name, "disconnected", reason)

        if !wasManual {
            scheduleAutoReconnect(for: peripheral)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let services = peripheral.services else { return }
        for service in services where service.uuid == Self.serviceUUID {
            peripheral.discoverCharacteristics([Self.txCharacteristicUUID, Self.rxCharacteristicUUID], for: service)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil, let chars = service.characteristics else { return }
        let peerId = peripheral.identifier.uuidString

        for char in chars {
            if char.uuid == Self.txCharacteristicUUID {
                peripheralTxCharacteristics[peerId] = char
            } else if char.uuid == Self.rxCharacteristicUUID {
                peripheral.setNotifyValue(true, for: char)
            }
        }

        if peripheralTxCharacteristics[peerId] != nil {
            onConnectionStateChanged?(peerId, peripheral.name, "connected", "Connected via Native CoreBluetooth BLE.")
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil,
              characteristic.uuid == Self.rxCharacteristicUUID,
              let data = characteristic.value else { return }
        handleIncomingRawData(data, fromPeerId: peripheral.identifier.uuidString)
    }
}

// MARK: - CBPeripheralManagerDelegate (GATT Server for Incoming Android/iOS Connections)

extension FreeConnectBLEManager: CBPeripheralManagerDelegate {

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        if peripheral.state == .poweredOn && isUserBluetoothEnabled {
            setupGattServiceAndAdvertise()
        }
        emitBluetoothState(message: nil)
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
        let peerId = central.identifier.uuidString
        guard isUserBluetoothEnabled else { return }
        if subscribedCentrals[peerId] != nil {
            return
        }
        // Security: never auto-connect without explicit user approval
        pendingApprovalCentrals[peerId] = central
        onConnectionRequest?(peerId, "Nearby BLE Device", nil)
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
        let peerId = central.identifier.uuidString
        pendingApprovalCentrals.removeValue(forKey: peerId)
        let wasApproved = subscribedCentrals.removeValue(forKey: peerId) != nil
        if wasApproved {
            onConnectionStateChanged?(peerId, "Nearby BLE Peer", "disconnected", "Remote BLE device disconnected.")
        }
        onPeerLost?(peerId)
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for req in requests {
            let peerId = req.central.identifier.uuidString
            guard subscribedCentrals[peerId] != nil else {
                peripheral.respond(to: req, withResult: .insufficientAuthorization)
                continue
            }
            if req.characteristic.uuid == Self.txCharacteristicUUID, let value = req.value {
                handleIncomingRawData(value, fromPeerId: peerId)
            }
            peripheral.respond(to: req, withResult: .success)
        }
    }

    func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
        guard let rxChar = rxCharacteristic else { return }
        while !pendingNotificationQueue.isEmpty {
            let item = pendingNotificationQueue[0]
            let ok = peripheral.updateValue(item.data, for: rxChar, onSubscribedCentrals: [item.central])
            if ok {
                pendingNotificationQueue.removeFirst()
            } else {
                break
            }
        }
    }
}
