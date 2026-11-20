# FreeConnect Native iOS Container (CoreBluetooth + MultipeerConnectivity)

Apple iOS Safari/WebKit intentionally does not implement the Web Bluetooth API (`navigator.bluetooth`).
To give iPhone users **true zero-Wi-Fi, zero-internet Bluetooth Low Energy (BLE) messaging with both iPhones and Android phones**, bundle the built FreeConnect web app (`npm run build` → `dist/`) inside this native Swift iOS container.

## Included Native Modules

1. **`FreeConnectBLEManager.swift`** — Dual-Role CoreBluetooth (`CBCentralManager` + `CBPeripheralManager`)
   - Advertises and scans for FreeConnect GATT Service `F000FC01-0451-4000-B000-000000000000`
   - TX Write Characteristic: `F000FC02-0451-4000-B000-000000000000`
   - RX Notify Characteristic: `F000FC03-0451-4000-B000-000000000000`
   - Uses identical `FC1|<packetId>|<seq>/<total>|<slice>` 140-byte chunk framing as `android-freeconnect` (`FreeConnectBleManager.kt`) and `src/utils/webBluetoothContact.ts`
   - Supports **iPhone ↔ Android** and **iPhone ↔ iPhone** pure BLE offline messaging with automatic reconnection on unexpected drops

2. **`FreeConnectMultipeerManager.swift`** — Apple `MultipeerConnectivity`
   - High-speed encrypted **iPhone ↔ iPhone** offline peer-to-peer messaging over Apple Bluetooth + Peer-to-Peer Wi-Fi (AWDL) without any router or internet

3. **`FreeConnectWebViewBridge.swift`** — `WKWebView` + `WKScriptMessageHandler`
   - Exposes `window.webkit.messageHandlers.freeConnectNative` and dispatches live radio events to `window.__freeConnectNativeEvent(...)`, automatically activating native discovery and transport inside `src/utils/nativeOfflineBridge.ts`

4. **`Info.plist`** — Required Bluetooth, Local Network, Bonjour (`_freeconnect._tcp`), Camera, and Microphone permissions

## Quick Xcode Setup

1. Run `npm run build` in the repository root to generate `dist/`.
2. Create a new iOS App project in Xcode (iOS 15+, UIKit or SwiftUI hosting `FreeConnectWebViewController`).
3. Add `FreeConnectBLEManager.swift`, `FreeConnectMultipeerManager.swift`, and `FreeConnectWebViewBridge.swift` to the Xcode target.
4. Drag the built `dist/` folder into Xcode as a **Folder Reference** (blue folder icon) so `Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "dist")` loads completely offline.
5. Merge the keys from `Info.plist` into your target's `Info.plist`.
6. Deploy to a physical iPhone (CoreBluetooth requires real hardware; the iOS Simulator does not simulate Bluetooth radios).
