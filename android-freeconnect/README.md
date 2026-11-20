# FreeConnect — 100% Free Offline Bluetooth Messenger (Android)

FreeConnect is a native Android application written in **Kotlin + Jetpack Compose** that enables private, end-to-end encrypted messaging and experimental multi-hop mesh relaying strictly over **Bluetooth Classic (RFCOMM/SPP)** and **Bluetooth Low Energy (BLE)** discovery.

**Zero Internet Guarantee:** `android.permission.INTERNET` is intentionally absent from `AndroidManifest.xml`. No Firebase, no Wi-Fi, no Wi-Fi Direct, no cellular data, and no cloud servers are used.

---

## 1. Build & Installation Instructions

### Requirements
- **Android Studio Ladybug (2024.2)** or newer
- **JDK 17** (bundled with Android Studio)
- **Android SDK 35** (`compileSdk = 35`, `minSdk = 26` / Android 8.0+)
- **2 to 4 physical Android phones** (Android emulators do **not** have real Bluetooth radio hardware)

### Build Steps
1. Open the `android-freeconnect/` folder in Android Studio.
2. Wait for Gradle Sync to finish downloading AndroidX / Compose / Room dependencies (internet is only needed on your development PC for Gradle build dependencies — the compiled APK has zero internet permission).
3. Enable **Developer Options -> USB Debugging** on each physical Android test phone.
4. Connect Phone A via USB and run:
   ```bash
   ./gradlew assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   # Build minified Release APK (configure signingConfig in app/build.gradle.kts)
   ./gradlew assembleRelease
   ```
5. Repeat installation on Phone B, Phone C, and Phone D (or transfer the APK offline via USB/Bluetooth and install).

### Included Ultimate Modules (20 Jetpack Compose Screens)
- **Complete Messaging:** 1-to-1 E2EE text, Group Chat, Voice Notes (`MediaRecorder` AAC 32kbps), chunked encrypted File Transfers (`16KB` RFCOMM frames with progress & cancellation), reactions, replies, forwarding, edit/delete, scheduled sends, self-destruct timers, and PIN-protected private conversations.
- **Mesh & Emergency SOS:** Real Bluetooth Classic RFCOMM + BLE discovery, multi-hop zero-knowledge relay (`Phone A -> B -> C -> D`), store-and-forward offline queue, duplicate/loop prevention, interactive Network Map, and Priority Emergency SOS broadcast.
- **Privacy, Themes & Localization:** ECDH P-256 + HKDF-SHA256 + AES-256-GCM + ECDSA handshake auth, PBKDF2-SHA256 App PIN & BiometricPrompt, ZXing offline QR pairing, Dark/Light/Auto themes, and full `strings.xml` localization for **English**, **Bengali (`values-bn`)**, **Hindi (`values-hi`)**, and **Arabic RTL (`values-ar`)**.

---

## 2. Physical Multi-Phone Testing Protocol

### Pre-Test Verification (True Offline Mode)
On every test phone:
- Turn ON **Airplane Mode**.
- Turn OFF **Wi-Fi** and **Mobile Data**.
- Turn ON **Bluetooth** only.
- Launch **FreeConnect**, create a unique username on each phone (`Phone A`, `Phone B`, `Phone C`, `Phone D`), and grant all Bluetooth runtime permissions.

### Test 1: Device Discovery & Pairing (2 Phones)
1. Open **Nearby Devices** on Phone A and Phone B.
2. Verify Phone B appears (either as a `FreeConnect Beacon` via BLE or `Classic BT` via Bluetooth inquiry).
3. Tap **Pair** if unbonded and confirm the Android Bluetooth pairing dialog on both phones.
4. Tap **Connect** on Phone A.
5. Verify both phones open **Connections** showing `CONNECTED` and identical 16-character **ECDH Safety Numbers**.

### Test 2: Encrypted 1-to-1 Messaging
1. Tap **Message** on Phone A to open the **Chat Screen** with Phone B.
2. Send `"Hello over offline Bluetooth!"`.
3. Verify Phone B receives the plaintext immediately and Phone A's indicator transitions `Sent -> Delivered`.

### Test 3: Disconnect & Auto-Reconnect
1. Walk Phone B out of range (~15–25m) or toggle Bluetooth off briefly on Phone B.
2. Observe the connection status change to `DISCONNECTED` with a clear error message.
3. Re-enable Bluetooth on Phone B; verify Phone A automatically reconnects via exponential backoff.

### Test 4: Offline Message Queuing (Store-and-Forward)
1. While Phone B is disconnected, send 2 messages from Phone A to Phone B.
2. Verify status shows **Queued offline** and **Network Status -> Queued Offline Packets** increments.
3. Reconnect Phone B; verify queued messages flush automatically and flip to **Delivered**.

### Test 5: Multi-Device Mesh Relay (3 or 4 Phones: `A -> B -> C -> D`)
1. Place phones in a physical line spaced ~12–18m apart so adjacent phones are in range, while Phone A cannot directly reach Phone C or Phone D:
   - Connect `Phone A <-> Phone B`
   - Connect `Phone B <-> Phone C`
   - Connect `Phone C <-> Phone D`
2. Wait ~2 seconds for `PEER_DIRECTORY` announcements to propagate so Phone A learns Phone D's `nodeId` and ECDH public key (shown as `Relay via ... · 3 hops`).
3. Ensure **Settings -> Enable Multi-Hop Mesh Relay** is ON on Phone B and Phone C.
4. From Phone A, open chat with Phone D and send a secret message.
5. Verify:
   - Phone B and Phone C increment `Packets Relayed` in **Network Status**, while **never** storing or displaying Phone A's plaintext in their Chat Screens.
   - Phone D decrypts and displays the message and routes a `DELIVERY_ACK` back through C and B to Phone A (`Delivered (3 hops)`).

---

## 3. Debugging with ADB Logcat

Monitor real-time Bluetooth sockets, cryptographic handshakes, and mesh relay hops via USB:
```bash
adb logcat -s FreeConnectClassic FreeConnectBle FreeConnectMesh
```

---

## 4. Honest Android Hardware & OS Limitations

1. **Physical Distance:** Standard Android Class 2 Bluetooth radios cover ~10–30 meters unobstructed (less through concrete walls). Mesh relay extends reach strictly when real participating FreeConnect devices form a continuous physical chain.
2. **Concurrent RFCOMM Peers:** Most Android Bluetooth chipsets stably sustain **3 to 5 simultaneous RFCOMM sockets** (up to 7 theoretical piconet limit). FreeConnect caps concurrent links at 5 to prevent radio starvation.
3. **BLE Peripheral Advertising:** Older/budget Android chipsets may report `isMultipleAdvertisementSupported == false`. FreeConnect automatically falls back to Bluetooth Classic inquiry discovery and RFCOMM server listening.
4. **Background Execution & Doze:** Android restricts background radio work unless a **Foreground Service (`connectedDevice`)** is running with a visible notification. Aggressive OEM battery savers (Xiaomi/Huawei/Samsung) may still suspend background apps unless battery optimization is set to *Unrestricted* for FreeConnect.
