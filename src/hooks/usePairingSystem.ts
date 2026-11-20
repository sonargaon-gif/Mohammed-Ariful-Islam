import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivePairingClaim,
  AdminOverviewPayload,
  AuthenticatedUserProfile,
  CodeVerificationResult,
  PairedPrivateRoom,
  PairedRoomMessage,
  PairingCodeStatus,
  PairingPoolCard,
  PairingRequestRecord,
  PairingSessionUser,
} from '../types/pairing';
import {
  adminDisableCode,
  adminGenerateCodes,
  adminRecycleExpiredCodes,
  cancelActivePairingCode,
  claimPairingCode,
  disconnectPairedRoom,
  fetchAdminOverview,
  fetchCuratedCodePool,
  fetchPairingState,
  fetchRoomMessages,
  getStoredPairingToken,
  postRoomMessage,
  respondPairingRequest,
  sendPairingConnectionRequest,
  syncPairingSession,
  unlockAdminAccess,
  verifyPairingCode,
} from '../utils/pairingApi';

function detectUserPlatform(): string {
  if (typeof navigator === 'undefined') return 'browser';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return 'iPhone / Safari';
  if (/Android/i.test(ua)) return 'Android / Chrome';
  if (/Macintosh|Mac OS/i.test(ua)) return 'macOS Browser';
  if (/Windows/i.test(ua)) return 'Windows Browser';
  return 'Web Browser';
}

export function usePairingSystem(
  authUser: AuthenticatedUserProfile | null,
  localDeviceId: string
) {
  const [sessionUser, setSessionUser] = useState<PairingSessionUser | null>(authUser);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  const [poolCards, setPoolCards] = useState<PairingPoolCard[]>([]);
  const [poolAvailableCount, setPoolAvailableCount] = useState<number>(0);
  const [poolLoading, setPoolLoading] = useState(false);

  const [myClaim, setMyClaim] = useState<ActivePairingClaim | null>(null);
  const [requests, setRequests] = useState<PairingRequestRecord[]>([]);
  const [rooms, setRooms] = useState<PairedPrivateRoom[]>([]);
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, PairedRoomMessage[]>>({});
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [justConnectedRoomId, setJustConnectedRoomId] = useState<string | null>(null);

  const [verificationResult, setVerificationResult] = useState<CodeVerificationResult | null>(null);
  const [adminOverview, setAdminOverview] = useState<AdminOverviewPayload | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  activeRoomIdRef.current = activeRoomId;

  const refreshState = useCallback(async () => {
    try {
      const state = await fetchPairingState();
      setMyClaim(state.myClaim);
      setRequests(state.requests);
      setRooms(state.rooms);
    } catch {
      // Transient fetch failure ignored; websocket or retry handles sync
    }
  }, []);

  const refreshPool = useCallback(async () => {
    setPoolLoading(true);
    try {
      const pool = await fetchCuratedCodePool(15);
      setPoolCards(pool.cards);
      setPoolAvailableCount(pool.totalAvailableCount);
      setMyClaim(pool.myClaim);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Could not load pairing code pool.');
    } finally {
      setPoolLoading(false);
    }
  }, []);

  // Keep sessionUser synchronized with permanent authenticated account; reset on logout/delete
  useEffect(() => {
    if (!authUser) {
      setSessionUser(null);
      setSessionReady(false);
      setSessionError(null);
      setWsConnected(false);
      setPoolCards([]);
      setMyClaim(null);
      setRequests([]);
      setRooms([]);
      setMessagesByRoom({});
      setActiveRoomId(null);
      setJustConnectedRoomId(null);
      setVerificationResult(null);
      setAdminOverview(null);
      return;
    }

    let cancelled = false;
    setSessionError(null);
    setSessionUser(authUser);

    void syncPairingSession({
      displayName: authUser.fullName,
      username: authUser.username,
      bio: authUser.bio || authUser.statusNote || '',
      avatarDataUrl: authUser.avatarDataUrl ?? null,
      deviceId: localDeviceId || authUser.deviceId,
      platform: detectUserPlatform(),
    })
      .then((res) => {
        if (cancelled) return;
        setSessionUser(res.user);
        setMyClaim(res.myClaim);
        setRequests(res.requests);
        setRooms(res.rooms);
        setSessionReady(true);
        void refreshPool();
      })
      .catch((err) => {
        if (cancelled) return;
        setSessionError(
          err instanceof Error ? err.message : 'Unable to reach pairing backend server.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    authUser?.id,
    authUser?.fullName,
    authUser?.username,
    authUser?.bio,
    authUser?.statusNote,
    authUser?.avatarDataUrl,
    authUser?.phoneE164,
    authUser?.showPhoneToPeers,
    localDeviceId,
    refreshPool,
  ]);

  // Real-time authenticated WebSocket connection for instant requests, messaging, delivery receipts & presence
  useEffect(() => {
    if (!sessionReady || !sessionUser) return;
    const token = getStoredPairingToken();
    if (!token) return;

    let disposed = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/pairing?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        setWsConnected(true);
        void refreshState();
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25_000);
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as Record<string, unknown>;
          const type = String(data.type ?? '');

          if (type === 'pairing:request_received') {
            const incoming = data.request as PairingRequestRecord | undefined;
            if (incoming) {
              setRequests((prev) => {
                const exists = prev.some((r) => r.id === incoming.id);
                return exists ? prev.map((r) => (r.id === incoming.id ? incoming : r)) : [incoming, ...prev];
              });
            }
          } else if (type === 'pairing:request_rejected') {
            const reqId = String(data.requestId ?? '');
            setRequests((prev) =>
              prev.map((r) => (r.id === reqId ? { ...r, status: 'rejected', respondedAt: Date.now() } : r))
            );
          } else if (type === 'pairing:connected') {
            const room = data.room as PairedPrivateRoom | undefined;
            const reqId = String(data.requestId ?? '');
            if (room) {
              setRooms((prev) => {
                const exists = prev.some((r) => r.id === room.id);
                return exists ? prev.map((r) => (r.id === room.id ? room : r)) : [room, ...prev];
              });
              setActiveRoomId(room.id);
              setJustConnectedRoomId(room.id);
            }
            setMyClaim(null);
            setRequests((prev) =>
              prev.map((r) =>
                r.id === reqId
                  ? { ...r, status: 'accepted', roomId: room?.id ?? r.roomId, respondedAt: Date.now() }
                  : r
              )
            );
            void refreshPool();
          } else if (type === 'pairing:message') {
            const roomId = String(data.roomId ?? '');
            const msg = data.message as PairedRoomMessage | undefined;
            if (roomId && msg) {
              setMessagesByRoom((prev) => {
                const existing = prev[roomId] ?? [];
                if (existing.some((m) => m.id === msg.id)) return prev;
                return { ...prev, [roomId]: [...existing, msg] };
              });
              setRooms((prev) =>
                prev.map((r) =>
                  r.id === roomId
                    ? {
                        ...r,
                        lastMessageText: msg.text,
                        lastMessageAt: msg.createdAt,
                        unreadCount: activeRoomIdRef.current === roomId ? 0 : r.unreadCount + 1,
                      }
                    : r
                )
              );
              if (activeRoomIdRef.current === roomId && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'pairing:ack_room', roomId }));
              }
            }
          } else if (type === 'pairing:messages_delivered') {
            const roomId = String(data.roomId ?? '');
            const ids = Array.isArray(data.messageIds) ? (data.messageIds as string[]) : [];
            if (roomId && ids.length > 0) {
              const idSet = new Set(ids);
              setMessagesByRoom((prev) => {
                const list = prev[roomId];
                if (!list) return prev;
                return {
                  ...prev,
                  [roomId]: list.map((m) =>
                    idSet.has(m.id) ? { ...m, deliveryStatus: 'delivered', deliveredAt: Date.now() } : m
                  ),
                };
              });
            }
          } else if (type === 'pairing:room_disconnected') {
            const roomId = String(data.roomId ?? '');
            const by = String(data.disconnectedBy ?? '');
            setRooms((prev) =>
              prev.map((r) =>
                r.id === roomId
                  ? { ...r, status: 'disconnected', disconnectedAt: Date.now(), disconnectedBy: by }
                  : r
              )
            );
          } else if (type === 'pairing:presence') {
            const uid = String(data.userId ?? '');
            const online = Boolean(data.online);
            const lastSeenAt = Number(data.lastSeenAt ?? Date.now());
            setRooms((prev) =>
              prev.map((r) =>
                r.peer.id === uid
                  ? { ...r, peer: { ...r.peer, online, lastSeenAt } }
                  : r
              )
            );
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (pingTimer !== null) {
          window.clearInterval(pingTimer);
          pingTimer = null;
        }
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (pingTimer !== null) window.clearInterval(pingTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [sessionReady, sessionUser, refreshPool, refreshState]);

  // Select / claim a code from the backend pool
  const selectCode = useCallback(
    async (code: string): Promise<{ ok: boolean; message: string }> => {
      try {
        const res = await claimPairingCode(code);
        setMyClaim(res.claim);
        await refreshPool();
        return {
          ok: true,
          message: `Code ${res.claim.code} reserved for 10 minutes. Share it via WhatsApp or copy it.`,
        };
      } catch (err) {
        await refreshPool();
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Could not reserve this code.',
        };
      }
    },
    [refreshPool]
  );

  // Cancel active unused code and release it back to the pool
  const cancelMyCode = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    try {
      const res = await cancelActivePairingCode();
      setMyClaim(null);
      await refreshPool();
      await refreshState();
      return {
        ok: true,
        message: res.releasedCode
          ? `Code ${res.releasedCode} cancelled and returned to the available pool.`
          : 'No active code to cancel.',
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Unable to cancel code.',
      };
    }
  }, [refreshPool, refreshState]);

  // Verify received 6-digit code against backend DB
  const verifyReceivedCode = useCallback(async (rawCode: string): Promise<CodeVerificationResult> => {
    const clean = rawCode.replace(/\D/g, '').slice(0, 6);
    try {
      const res = await verifyPairingCode(clean);
      setVerificationResult(res);
      return res;
    } catch (err) {
      const fallback: CodeVerificationResult = {
        verdict: 'invalid',
        code: clean,
        message: err instanceof Error ? err.message : 'Verification failed.',
      };
      setVerificationResult(fallback);
      return fallback;
    }
  }, []);

  const clearVerification = useCallback(() => {
    setVerificationResult(null);
  }, []);

  const sendRequestForCode = useCallback(
    async (code: string): Promise<{ ok: boolean; message: string }> => {
      try {
        const res = await sendPairingConnectionRequest(code);
        setRequests((prev) => {
          const exists = prev.some((r) => r.id === res.request.id);
          return exists ? prev.map((r) => (r.id === res.request.id ? res.request : r)) : [res.request, ...prev];
        });
        return {
          ok: true,
          message: `Connection request sent to ${res.request.peer.displayName}. Waiting for acceptance.`,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Could not send connection request.',
        };
      }
    },
    []
  );

  const respondRequest = useCallback(
    async (
      requestId: string,
      accept: boolean
    ): Promise<{ ok: boolean; roomId?: string; message: string }> => {
      try {
        const res = await respondPairingRequest(requestId, accept);
        setRequests((prev) =>
          prev.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status: res.status,
                  roomId: res.room?.id ?? r.roomId,
                  respondedAt: Date.now(),
                }
              : r
          )
        );
        if (accept && res.room) {
          setMyClaim(null);
          setRooms((prev) => {
            const exists = prev.some((r) => r.id === res.room!.id);
            return exists ? prev.map((r) => (r.id === res.room!.id ? res.room! : r)) : [res.room!, ...prev];
          });
          setActiveRoomId(res.room.id);
          setJustConnectedRoomId(res.room.id);
          await refreshPool();
          return {
            ok: true,
            roomId: res.room.id,
            message: `Connected with ${res.room.peer.displayName}. Private room is now active.`,
          };
        }
        return {
          ok: true,
          message: 'Connection request rejected.',
        };
      } catch (err) {
        await refreshState();
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Unable to respond to request.',
        };
      }
    },
    [refreshPool, refreshState]
  );

  const loadRoomMessages = useCallback(async (roomId: string) => {
    if (!roomId) {
      setActiveRoomId(null);
      return;
    }
    setActiveRoomId(roomId);
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)));
    try {
      const res = await fetchRoomMessages(roomId);
      setMessagesByRoom((prev) => ({ ...prev, [roomId]: res.messages }));
    } catch {
      // Handled gracefully
    }
  }, []);

  const sendPrivateMessage = useCallback(
    async (roomId: string, text: string): Promise<{ ok: boolean; error?: string }> => {
      const clean = text.trim();
      if (!clean || !sessionUser) return { ok: false, error: 'Message is empty.' };

      const tempId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const optimistic: PairedRoomMessage = {
        id: tempId,
        roomId,
        senderId: sessionUser.id,
        text: clean,
        deliveryStatus: 'sending',
        createdAt: Date.now(),
        deliveredAt: null,
      };

      setMessagesByRoom((prev) => ({
        ...prev,
        [roomId]: [...(prev[roomId] ?? []), optimistic],
      }));

      try {
        const res = await postRoomMessage(roomId, clean);
        setMessagesByRoom((prev) => ({
          ...prev,
          [roomId]: (prev[roomId] ?? []).map((m) => (m.id === tempId ? res.message : m)),
        }));
        setRooms((prev) =>
          prev.map((r) =>
            r.id === roomId
              ? { ...r, lastMessageText: res.message.text, lastMessageAt: res.message.createdAt }
              : r
          )
        );
        return { ok: true };
      } catch (err) {
        setMessagesByRoom((prev) => ({
          ...prev,
          [roomId]: (prev[roomId] ?? []).map((m) =>
            m.id === tempId ? { ...m, deliveryStatus: 'failed' } : m
          ),
        }));
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Message failed to send.',
        };
      }
    },
    [sessionUser]
  );

  const disconnectRoom = useCallback(async (roomId: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      await disconnectPairedRoom(roomId);
      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomId
            ? {
                ...r,
                status: 'disconnected',
                disconnectedAt: Date.now(),
                disconnectedBy: sessionUser?.id ?? null,
              }
            : r
        )
      );
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to disconnect room.',
      };
    }
  }, [sessionUser?.id]);

  // --- Admin Control Center ---

  const unlockAdmin = useCallback(async (passcode: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await unlockAdminAccess(passcode);
      setSessionUser((prev) => (prev ? { ...prev, role: res.role } : prev));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Invalid admin passcode.' };
    }
  }, []);

  const loadAdminOverview = useCallback(
    async (status: PairingCodeStatus | 'all' = 'all', search = ''): Promise<AdminOverviewPayload | null> => {
      try {
        const data = await fetchAdminOverview(status, search);
        setAdminOverview(data);
        return data;
      } catch {
        return null;
      }
    },
    []
  );

  const generateMoreCodes = useCallback(
    async (count: number): Promise<{ ok: boolean; message: string }> => {
      try {
        const res = await adminGenerateCodes(count);
        await loadAdminOverview();
        await refreshPool();
        return {
          ok: true,
          message: `Generated ${res.generated.toLocaleString()} new random codes. Total pool: ${res.totalGenerated.toLocaleString()}.`,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Could not generate codes.',
        };
      }
    },
    [loadAdminOverview, refreshPool]
  );

  const disableSuspiciousCode = useCallback(
    async (code: string, reason: string): Promise<{ ok: boolean; message: string }> => {
      try {
        const res = await adminDisableCode(code, reason);
        await loadAdminOverview();
        await refreshPool();
        return { ok: true, message: `Code ${res.code} disabled and removed from active circulation.` };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Could not disable code.',
        };
      }
    },
    [loadAdminOverview, refreshPool]
  );

  const recycleExpiredCodes = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    try {
      const res = await adminRecycleExpiredCodes();
      await loadAdminOverview();
      await refreshPool();
      return {
        ok: true,
        message: `Released ${res.recycledToAvailable} expired unused code(s) back to the available pool.`,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Could not recycle expired codes.',
      };
    }
  }, [loadAdminOverview, refreshPool]);

  const incomingPendingRequests = useMemo(
    () => requests.filter((r) => r.direction === 'incoming' && r.status === 'pending'),
    [requests]
  );

  const outgoingRequests = useMemo(
    () => requests.filter((r) => r.direction === 'outgoing'),
    [requests]
  );

  const activeRoomsCount = useMemo(
    () => rooms.filter((r) => r.status === 'active').length,
    [rooms]
  );

  const clearJustConnectedRoom = useCallback(() => {
    setJustConnectedRoomId(null);
  }, []);

  return {
    sessionUser,
    sessionReady,
    sessionError,
    wsConnected,
    poolCards,
    poolAvailableCount,
    poolLoading,
    myClaim,
    requests,
    incomingPendingRequests,
    outgoingRequests,
    rooms,
    activeRoomsCount,
    messagesByRoom,
    activeRoomId,
    justConnectedRoomId,
    verificationResult,
    adminOverview,
    setActiveRoomId,
    clearJustConnectedRoom,
    refreshPool,
    refreshState,
    selectCode,
    cancelMyCode,
    verifyReceivedCode,
    clearVerification,
    sendRequestForCode,
    respondRequest,
    loadRoomMessages,
    sendPrivateMessage,
    disconnectRoom,
    unlockAdmin,
    loadAdminOverview,
    generateMoreCodes,
    disableSuspiciousCode,
    recycleExpiredCodes,
  };
}
