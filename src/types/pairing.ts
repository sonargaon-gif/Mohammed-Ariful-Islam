export type PairingCodeStatus = 'available' | 'claimed' | 'used' | 'expired' | 'disabled';

export type CodeVerifyVerdict =
  | 'valid'
  | 'invalid'
  | 'already_used'
  | 'expired'
  | 'user_not_available';

export type OtpPurpose = 'register' | 'login' | 'change_phone';

export interface AuthenticatedUserProfile {
  id: string;
  fullName: string;
  displayName: string;
  username: string;
  bio: string;
  statusNote: string;
  avatarDataUrl: string | null;
  countryCode: string;
  phoneNational: string;
  phoneE164: string;
  phoneVerified: boolean;
  phoneVerifiedAt: number | null;
  showPhoneToPeers: boolean;
  accountStatus: 'active' | 'suspended';
  deviceId: string;
  platform: string;
  role: 'user' | 'admin';
  createdAt: number;
  lastSeenAt: number;
}

export type PairingSessionUser = AuthenticatedUserProfile;

export interface PairingPeerProfile {
  id: string;
  displayName: string;
  username: string;
  bio: string;
  avatarDataUrl: string | null;
  deviceId: string;
  platform: string;
  phoneVerified?: boolean;
  publicPhone?: string | null;
  online: boolean;
  lastSeenAt: number;
}

export interface OtpSendResponse {
  ok: true;
  challengeId: string;
  phoneE164: string;
  expiresAt: number;
  deliveryChannel: 'sms' | 'instant_secure_channel';
  deliveryMessage: string;
  secureChannelOtp?: string;
}

export interface PairingPoolCard {
  code: string;
  status: 'available' | 'taken';
  expiresAt: number | null;
  isMine: boolean;
}

export interface ActivePairingClaim {
  code: string;
  claimedAt: number;
  expiresAt: number;
  status: PairingCodeStatus;
}

export interface CodeVerificationResult {
  verdict: CodeVerifyVerdict;
  code: string;
  message: string;
  owner?: PairingPeerProfile;
  expiresAt?: number;
}

export interface PairingRequestRecord {
  id: string;
  code: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
  createdAt: number;
  respondedAt: number | null;
  direction: 'incoming' | 'outgoing';
  peer: PairingPeerProfile;
  roomId: string | null;
}

export interface PairedPrivateRoom {
  id: string;
  code: string;
  status: 'active' | 'disconnected';
  createdAt: number;
  disconnectedAt: number | null;
  disconnectedBy: string | null;
  peer: PairingPeerProfile;
  lastMessageText: string | null;
  lastMessageAt: number | null;
  unreadCount: number;
}

export interface PairedRoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  text: string;
  deliveryStatus: 'sending' | 'sent' | 'delivered' | 'failed';
  createdAt: number;
  deliveredAt: number | null;
}

export interface AdminStatsData {
  totalGenerated: number;
  availableCodes: number;
  claimedCodes: number;
  expiredCodes: number;
  totalExpiredEvents: number;
  usedCodes: number;
  disabledCodes: number;
  activeConnections: number;
  pendingRequests: number;
  registeredUsers: number;
}

export interface AdminCodeItem {
  code: string;
  status: PairingCodeStatus;
  claimedByUsername: string | null;
  claimedByName: string | null;
  claimedAt: number | null;
  expiresAt: number | null;
  usedAt: number | null;
  disabledReason: string | null;
  timesExpired: number;
}

export interface AdminConnectionItem {
  roomId: string;
  code: string;
  status: 'active' | 'disconnected';
  userAName: string;
  userAUsername: string;
  userBName: string;
  userBUsername: string;
  createdAt: number;
  messageCount: number;
}

export interface AdminEventItem {
  id: number;
  eventType: string;
  code: string | null;
  userId: string | null;
  severity: 'info' | 'warn' | 'error';
  message: string;
  createdAt: number;
}

export interface AdminOverviewPayload {
  stats: AdminStatsData;
  codes: AdminCodeItem[];
  connections: AdminConnectionItem[];
  events: AdminEventItem[];
}
