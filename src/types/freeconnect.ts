export type AppScreen =
  | 'welcome'
  | 'onboarding'
  | 'permissions'
  | 'home'
  | 'chat'
  | 'group'
  | 'nearby'
  | 'voice'
  | 'files'
  | 'contacts'
  | 'pairing'
  | 'sos'
  | 'network_map'
  | 'connections'
  | 'history'
  | 'profile'
  | 'settings'
  | 'privacy'
  | 'battery'
  | 'about';

export type MessageStatus =
  | 'SCHEDULED'
  | 'QUEUED_OFFLINE'
  | 'RELAYING'
  | 'SENT'
  | 'DELIVERED'
  | 'EXPIRED';

export type BatteryProfile = 'LOW_POWER' | 'BALANCED' | 'HIGH_RESPONSIVENESS';
export type ThemeMode = 'dark' | 'light' | 'auto';
export type ChatWallpaper = 'futuristic' | 'midnight' | 'arctic' | 'minimal';
export type TextSizeOption = 'sm' | 'md' | 'lg';

export interface PhoneNode {
  id: string;
  label: string;
  nodeId: string;
  displayName: string;
  deviceModel: string;
  bluetoothAddress: string;
  avatarUrl: string;
  initials: string;
  statusNote: string;
  bluetoothOn: boolean;
  relayEnabled: boolean;
  maxHopTtl: number;
  expiryHours: number;
  autoReconnect: boolean;
  batteryProfile: BatteryProfile;
  permissionsGranted: boolean;
  onboardingCompleted: boolean;
  publicKeyBase64: string;
  fingerprint: string;
  relayedCount: number;
  dedupBlockedCount: number;
  expiredPrunedCount: number;
  // Ultimate Contacts & Security fields
  favorites: string[];
  blockedPeerIds: string[];
  emergencyContactIds: string[];
  chatPins: Record<string, string>; // peerId -> 4-digit PIN
  appPin: string | null;
  biometricEnabled: boolean;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

export interface BluetoothLink {
  id: string;
  fromId: string;
  toId: string;
  distanceMeters: number;
  connected: boolean;
  paired: boolean;
  rssi: number;
  bytesTransferred: number;
  errorReason?: string;
}

export interface ChatMessage {
  messageId: string;
  ownerNodeId: string;
  peerId: string;
  senderId: string;
  recipientId: string;
  plaintext: string;
  ciphertextBase64: string;
  ivBase64: string;
  isOutgoing: boolean;
  timestamp: number;
  expiresAt: number;
  status: MessageStatus;
  hopCount: number;
  routeTrace: string[];
  // Ultimate Messaging features
  kind?: 'TEXT' | 'VOICE' | 'FILE' | 'SOS';
  reactions?: string[];
  replyToText?: string;
  forwardedFrom?: string;
  isEdited?: boolean;
  selfDestructAt?: number;
  scheduledFor?: number;
  voiceDurationSec?: number;
  voiceAudioUrl?: string;
  attachmentName?: string;
  attachmentSizeKb?: number;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  deliveredToLabels: string[];
}

export interface OfflineFileTransfer {
  id: string;
  fromId: string;
  toId: string;
  fileName: string;
  category: 'Audio' | 'Image' | 'Document' | 'Voice';
  sizeKb: number;
  progress: number; // 0..100
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
  timestamp: number;
}

export interface SosBroadcastRecord {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: number;
  reachedLabels: string[];
  maxHopsUsed: number;
}

export interface QueuedRelayPacket {
  packetId: string;
  holderId: string;
  senderId: string;
  recipientId: string;
  senderName: string;
  recipientName: string;
  ciphertextBase64: string;
  ivBase64: string;
  ttl: number;
  hopCount: number;
  routeTrace: string[];
  createdAt: number;
  expiresAt: number;
  isLocalOrigin: boolean;
}

export interface RelayTraceEvent {
  id: string;
  packetId: string;
  timestamp: number;
  kind:
    | 'ENCRYPTED'
    | 'RELAY_HOP'
    | 'QUEUED'
    | 'DELIVERED'
    | 'DEDUP_BLOCKED'
    | 'LINK_CHANGE'
    | 'SOS';
  summary: string;
  route: string[];
  ciphertextSnippet?: string;
  ivSnippet?: string;
  opaqueToRelay?: boolean;
}

export interface RealWebBluetoothDevice {
  id: string;
  name: string;
  connected: boolean;
  discoveredAt: number;
}
