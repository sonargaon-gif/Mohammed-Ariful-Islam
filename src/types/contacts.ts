export type WebsitePage =
  | 'landing'
  | 'welcome'
  | 'dashboard'
  | 'chat'
  | 'connect_iphone'
  | 'private_chats'
  | 'group'
  | 'nearby'
  | 'add_contact'
  | 'contacts'
  | 'voice'
  | 'files'
  | 'pairing'
  | 'admin_control'
  | 'network'
  | 'sos'
  | 'history'
  | 'profile'
  | 'settings'
  | 'privacy'
  | 'language';

export type ContactFilterTab =
  | 'all'
  | 'online_nearby'
  | 'recent'
  | 'favorites'
  | 'blocked';

export interface ContactRecord {
  id: string;
  name: string;
  username: string;
  phoneNumber: string; // Optional personal reference only — never used for network/SIM calls
  deviceId: string; // Unique FreeConnect Device ID (e.g. FC-9A2B4C)
  avatarDataUrl: string; // Local data URL or empty for initials
  description: string;
  isFavorite: boolean;
  isBlocked: boolean;
  isEmergencyContact?: boolean;
  createdAt: number;
  updatedAt: number;
  lastConnectedAt: number | null; // Only populated after a real hardware/peer connection event
  bluetoothDeviceId: string | null;
  bluetoothDeviceName: string | null;
}

export type LiveConnectionState =
  | 'disconnected'
  | 'searching'
  | 'request_sent'
  | 'request_received'
  | 'connecting'
  | 'connected'
  | 'failed';

export type TransportKind =
  | 'none'
  | 'native_ble'
  | 'native_wifi_direct'
  | 'web_bluetooth_gatt'
  | 'web_bluetooth_readonly'
  | 'offline_webrtc_p2p'
  | 'local_window_channel';

export type DevicePlatformKind = 'ios' | 'android' | 'desktop' | 'browser' | 'unknown';

export interface IncomingConnectionRequest {
  id: string;
  peerId: string;
  peerName: string;
  peerUsername?: string;
  deviceCode?: string;
  platform: DevicePlatformKind;
  transport: 'native_ble' | 'native_wifi_direct' | 'local_window_channel' | 'offline_webrtc_p2p';
  receivedAt: number;
  offerCode?: string; // Present when received via Offline P2P handshake
  codeVerified?: boolean; // True when authenticated via temporary 6-digit connection code
}

export interface TemporaryCodeSession {
  code: string; // 6-digit numeric string (never broadcast in plain text)
  nonce: string; // 128-bit random hex nonce
  commitment: string; // SHA-256(code:nonce:hostDeviceId)
  createdAt: number;
  expiresAt: number;
  failedAttempts: number;
  maxAttempts: number;
}

export interface DiscoveredCodeHost {
  hostDeviceId: string;
  hostName: string;
  hostUsername: string;
  hostPlatform: DevicePlatformKind;
  nonce: string;
  commitment: string;
  expiresAt: number;
  transport: 'local_window_channel' | 'native_ble' | 'native_wifi_direct';
  nativePeerId?: string;
  lastSeenAt: number;
}

export interface PendingCodeApproval {
  hostDeviceId: string;
  hostName: string;
  hostUsername: string;
  hostPlatform: DevicePlatformKind;
  nonce: string;
  proof: string;
  expiresAt: number;
  transport: 'local_window_channel' | 'native_ble' | 'native_wifi_direct';
  nativePeerId?: string;
}

export interface PrivateChatFolder {
  id: string;
  name: string;
  isLocked: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PrivateChatAssignment {
  contactId: string;
  folderId: string | null; // null = locked private chat without a named folder
  isLocked: boolean;
  lockedAt: number;
}

export interface PinSecuritySummary {
  hasPin: boolean;
  hasSecurityQuestion: boolean;
  securityQuestion: string | null;
  hasRecoveryKey: boolean;
  createdAt: number | null;
  updatedAt: number | null;
  failedAttempts: number;
  lockoutUntil: number | null;
}

export interface ContactLiveConnection {
  status: LiveConnectionState;
  transport: TransportKind;
  writable: boolean;
  availabilityText: string;
  detailMessage?: string;
  connectedDeviceName?: string;
  hardwareId?: string;
  isAutoReconnecting?: boolean;
  reconnectAttempt?: number;
  authenticated?: boolean;
  safetyNumber?: string;
  encrypted?: boolean;
  connectedAt?: number;
}

export type MessageDeliveryState =
  | 'SENDING'
  | 'QUEUED_OFFLINE'
  | 'SENT_OVER_BLUETOOTH'
  | 'SENT_OVER_P2P'
  | 'DELIVERED'
  | 'FAILED';

export interface ContactDirectMessage {
  id: string;
  contactId: string;
  text: string;
  timestamp: number;
  isOutgoing: boolean;
  senderName?: string;
  deliveryState: MessageDeliveryState;
  errorText?: string;
  kind?: 'text' | 'voice' | 'file' | 'sos';
  reactions?: string[];
  voiceDurationSec?: number;
  voiceDataUrl?: string;
  voiceMimeType?: string;
  fileName?: string;
  fileSizeKb?: number;
  fileCategory?: 'Image' | 'Document' | 'Audio' | 'Other';
  fileDataUrl?: string;
  fileMimeType?: string;
}

export interface WireMessagePacket {
  v: 1;
  type: 'message' | 'ack' | 'hello';
  packetId: string;
  senderDeviceId: string;
  senderName: string;
  senderUsername?: string;
  senderPublicKeyBase64?: string;
  timestamp: number;
  kind?: 'text' | 'voice' | 'file' | 'sos';
  text?: string;
  encrypted?: boolean;
  ciphertextBase64?: string;
  ivBase64?: string;
  voiceDurationSec?: number;
  voiceDataUrl?: string;
  voiceMimeType?: string;
  fileName?: string;
  fileSizeKb?: number;
  fileCategory?: 'Image' | 'Document' | 'Audio' | 'Other';
  fileDataUrl?: string;
  fileMimeType?: string;
  ackMessageId?: string;
}

export interface QrContactPayload {
  v: 1;
  name: string;
  username: string;
  deviceId: string;
  phoneNumber?: string;
  description?: string;
}

export type NativeBridgePlatform = 'none' | 'ios_native' | 'android_native';

export interface BrowserCapabilityReport {
  indexedDbSupported: boolean;
  webBluetoothSupported: boolean;
  webRtcSupported: boolean;
  cameraSupported: boolean;
  microphoneSupported: boolean;
  isSecureContext: boolean;
  isEmbeddedIframe: boolean;
  isIos: boolean;
  isAndroid: boolean;
  nativeBridgePlatform: NativeBridgePlatform;
  nativeTransports: Array<'native_ble' | 'native_wifi_direct'>;
}

export type BluetoothPermissionState =
  | 'granted'
  | 'prompt'
  | 'denied'
  | 'unsupported'
  | 'iframe_blocked';

export type BluetoothVisibilityState = 'hidden' | 'discoverable' | 'central_only' | 'unsupported';

export interface BluetoothRuntimeStatus {
  enabled: boolean;
  hardwareAvailable: boolean | null;
  permissionState: BluetoothPermissionState;
  visibilityState: BluetoothVisibilityState;
  platformSupportLevel: 'native_ios' | 'native_android' | 'web_bluetooth' | 'unsupported';
  statusMessage: string;
  permissionExplanation: string;
  lastCheckedAt: number;
}

export interface UserProfileRecord {
  name: string;
  username: string;
  phoneNumber?: string;
  deviceId: string;
  avatarDataUrl: string;
  bio: string;
  statusNote: string;
  fingerprint: string;
}

export interface DiscoveredBtDevice {
  id: string;
  name: string;
  connected: boolean;
  writable: boolean;
  serviceLabel?: string;
  discoveredAt: number;
  note: string;
  source: 'bluetooth' | 'local_peer' | 'native_ble' | 'native_wifi_direct';
  deviceCode?: string;
  username?: string;
  rssi?: number;
  peerPlatform?: string;
}

export interface WebGroupRoom {
  id: string;
  name: string;
  description: string;
  memberContactIds: string[];
  createdAt: number;
}

export interface WebGroupMessage {
  id: string;
  roomId: string;
  senderName: string;
  text: string;
  timestamp: number;
  sentLiveCount: number;
  queuedCount: number;
  reactions: string[];
}

export interface LocalVoiceClip {
  id: string;
  title: string;
  durationSec: number;
  createdAt: number;
  audioUrl: string;
  mimeType?: string;
  sentToContactName?: string;
}

export interface StagedOfflineFile {
  id: string;
  name: string;
  category: 'Image' | 'Document' | 'Audio' | 'Other';
  sizeKb: number;
  addedAt: number;
  status: 'STORED_LOCALLY' | 'QUEUED_FOR_PEER' | 'SENT_OVER_BLUETOOTH' | 'SENT_OVER_P2P';
  targetContactName?: string;
  objectUrl?: string;
  dataUrl?: string;
  mimeType?: string;
}

export interface WebSosRecord {
  id: string;
  message: string;
  timestamp: number;
  targetNames: string[];
  liveBluetoothCount: number;
  queuedOfflineCount: number;
}
