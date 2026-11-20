import { useState } from 'react';
import {
  AlertCircle,
  CheckSquare,
  Download,
  Smartphone,
  Square,
  Terminal,
} from 'lucide-react';
import { downloadAndroidProjectZip } from '../data/androidProjectFiles';

const TEST_SCENARIOS = [
  {
    id: 'offline-verify',
    title: '01. Verify True Zero-Internet Isolation',
    phones: '2+ Android phones',
    steps:
      'Enable Airplane Mode on all test devices. Confirm Wi-Fi and Mobile Data are OFF, then turn ON Bluetooth only. Verify AndroidManifest.xml has no android.permission.INTERNET.',
  },
  {
    id: 'discovery-pair',
    title: '02. BLE & Classic Discovery + QR Pairing',
    phones: 'Phone A & Phone B',
    steps:
      'Open Nearby Devices or QR Scanner on both phones. Verify BLE FreeConnect beacon or QR pairing payload exchanges Bluetooth MAC + ECDH P-256 identity key offline.',
  },
  {
    id: 'direct-chat',
    title: '03. Encrypted 1-to-1 RFCOMM Chat, Reactions & Self-Destruct',
    phones: 'Phone A <-> Phone B',
    steps:
      'Connect Phone A to Phone B. Verify identical 16-character ECDH Safety Numbers, send encrypted text + voice note + file transfer, test reactions, reply, edit, and self-destruct timer.',
  },
  {
    id: 'disconnect-reconnect',
    title: '04. Interruption Recovery & Offline Store-and-Forward Queue',
    phones: 'Phone A <-> Phone B',
    steps:
      'Walk Phone B >25m away or toggle Bluetooth off briefly. Send 2 messages while disconnected (stored in Room offline queue), bring back into range, and verify automatic queue flush.',
  },
  {
    id: 'relay-4',
    title: '05. 4-Phone Chained Relay & Loop Guard (A -> B -> C -> D)',
    phones: 'Phone A, B, C, D',
    steps:
      'Position phones ~14m apart in a chain (A<->B<->C<->D). Send A -> D and verify Phone B & C increment Packets Relayed without seeing plaintext, while SeenPacketDao blocks duplicate loops.',
  },
  {
    id: 'sos-pin-i18n',
    title: '06. Emergency SOS Broadcast, PIN/Biometric Lock & RTL Localization',
    phones: '2–4 Android phones',
    steps:
      'Trigger Priority SOS broadcast and verify delivery across connected Bluetooth chain. Test local App PIN + Chat PIN lock and switch language between English, Bengali, Hindi, and Arabic (RTL).',
  },
];

const HARDWARE_LIMITATIONS = [
  {
    area: 'Physical Radio Range',
    reality: '10–25 meters unobstructed per hop (5–12m indoors through walls).',
    mitigation:
      'Multi-hop relay and Emergency SOS extend reach ONLY when real participating FreeConnect phones form an active physical chain within Bluetooth range.',
  },
  {
    area: 'Concurrent RFCOMM Sockets',
    reality: 'Android Bluetooth chipsets typically cap stable simultaneous Classic links at 3–5 peers.',
    mitigation:
      'BluetoothClassicManager caps concurrent peer sockets at 5 and prioritizes active routes without radio starvation.',
  },
  {
    area: 'BLE Peripheral Advertising',
    reality: 'Some budget Android chipsets report isMultipleAdvertisementSupported = false.',
    mitigation:
      'BleDiscoveryManager detects hardware capability gracefully and falls back to Bluetooth Classic inquiry + RFCOMM ServerSocket.',
  },
  {
    area: 'Background Execution & Doze',
    reality: 'Android 12–15 kills background sockets unless backed by an active Foreground Service.',
    mitigation:
      'BluetoothForegroundService declares foregroundServiceType="connectedDevice" with a persistent notification and Low-Power / Balanced BLE duty-cycle profiles.',
  },
];

export function TestingAndDocsView() {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const toggleScenario = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      {/* Build & APK Generation Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-[#2563EB] dark:text-[#3B82F6]" />
              Android Studio Build & APK Generation
            </h2>
            <button
              onClick={() => void downloadAndroidProjectZip()}
              className="px-3.5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download .zip
            </button>
          </div>

          <ol className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300 list-decimal list-inside">
            <li>
              Extract{' '}
              <span className="font-mono text-slate-900 dark:text-white">
                FreeConnect-Ultimate-Android-Studio.zip
              </span>{' '}
              and open the folder in{' '}
              <strong className="text-slate-900 dark:text-white">
                Android Studio Ladybug (2024.2+)
              </strong>{' '}
              with JDK 17.
            </li>
            <li>
              Allow Gradle Sync to fetch AndroidX, Compose, Room, Biometric, and ZXing build libraries on your workstation (the compiled APK declares zero internet permission).
            </li>
            <li>
              Enable <strong className="text-slate-900 dark:text-white">USB Debugging</strong> on 2–4 physical Android phones (API 26+ / Android 8.0–15). Emulators lack real Bluetooth hardware.
            </li>
            <li>
              Build a debug APK for testing or sign a release APK via Android Studio{' '}
              <strong className="text-slate-900 dark:text-white">
                Build → Generate Signed App Bundle / APK
              </strong>
              .
            </li>
          </ol>

          <div className="rounded-xl bg-[#071120] border border-[#1A2D4D] p-4 font-mono text-xs text-slate-200 space-y-1.5 overflow-x-auto">
            <p className="text-slate-400"># Build Debug APK & install on connected phone</p>
            <p>./gradlew assembleDebug</p>
            <p>adb install -r app/build/outputs/apk/debug/app-debug.apk</p>
            <p className="text-slate-400 pt-2"># Build minified Release APK (configure signingConfig in app/build.gradle.kts)</p>
            <p className="text-cyan-300">./gradlew assembleRelease</p>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 p-6 flex flex-col justify-between space-y-4 shadow-sm">
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Terminal className="w-5 h-5 text-[#2563EB] dark:text-[#3B82F6]" />
              ADB Logcat & Permission Audit
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Inspect live RFCOMM sockets, ECDSA handshakes, chunked file transfers, SOS relays, and confirm zero INTERNET permission in the compiled APK:
            </p>
            <div className="rounded-xl bg-[#071120] border border-[#1A2D4D] p-4 font-mono text-xs text-[#60A5FA] space-y-2 overflow-x-auto">
              <p>adb logcat -s FreeConnectClassic FreeConnectBle FreeConnectMesh</p>
              <p className="text-slate-400"># Verify zero INTERNET permission in built APK</p>
              <p className="text-emerald-400">
                aapt dump permissions app/build/outputs/apk/debug/app-debug.apk
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Tip: On Samsung, Xiaomi, or OnePlus devices, set FreeConnect battery optimization to{' '}
            <strong className="text-slate-900 dark:text-slate-200">Unrestricted</strong> in Android Settings so OEM battery killers do not suspend background RFCOMM relay sockets.
          </p>
        </div>
      </div>

      {/* Physical Testing Checklist */}
      <div className="rounded-2xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Physical Multi-Phone Testing Protocol
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Interactive QA checklist for validating 2, 3, and 4 physical Android handsets completely offline.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-blue-600 dark:text-[#60A5FA]">
            {checkedIds.size} / {TEST_SCENARIOS.length} verified
          </span>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-[#1A2D4D]">
          {TEST_SCENARIOS.map((item) => {
            const done = checkedIds.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleScenario(item.id)}
                className="w-full py-3.5 flex items-start gap-3.5 text-left hover:bg-slate-50 dark:hover:bg-[#11203A]/50 px-2 rounded-lg transition-colors cursor-pointer"
              >
                {done ? (
                  <CheckSquare className="w-5 h-5 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`text-sm font-semibold ${
                        done
                          ? 'text-slate-400 line-through'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {item.title}
                    </span>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {item.phones}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    {item.steps}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Honest Android Hardware & OS Limitations */}
      <div className="rounded-2xl bg-white dark:bg-[#07152C]/75 backdrop-blur-xl border border-slate-200 dark:border-cyan-400/25 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-5 h-5 text-amber-500 dark:text-amber-400" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Honest Android Bluetooth Hardware & OS Limitations
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1A2D4D] text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4">Constraint</th>
                <th className="py-2.5 px-4">Real Hardware / OS Behavior</th>
                <th className="py-2.5 pl-4">FreeConnect Engineering Solution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#162744] text-sm">
              {HARDWARE_LIMITATIONS.map((row) => (
                <tr key={row.area}>
                  <td className="py-3.5 pr-4 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                    {row.area}
                  </td>
                  <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">{row.reality}</td>
                  <td className="py-3.5 pl-4 text-slate-600 dark:text-slate-400">
                    {row.mitigation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
