import { useCallback, useEffect, useState } from 'react';
import {
  AuthenticatedUserProfile,
  OtpPurpose,
  OtpSendResponse,
} from '../types/pairing';
import {
  ApiRequestError,
  completeAccountOtpLogin,
  completeAccountRegistration,
  completePhoneNumberChange,
  deletePermanentAccount,
  logoutAccountSession,
  patchPermanentProfile,
  requestPhoneOtp,
  restoreAuthenticatedSession,
  verifyPhoneOtp,
} from '../utils/pairingApi';

export type AuthGateStatus = 'checking' | 'unauthenticated' | 'authenticated';

export function detectClientPlatform(): string {
  if (typeof navigator === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return 'iPhone / Safari';
  if (/Android/i.test(ua)) return 'Android / Chrome';
  if (/Macintosh|Mac OS/i.test(ua)) return 'macOS Browser';
  if (/Windows/i.test(ua)) return 'Windows Browser';
  return 'Web Browser';
}

export function useAuthProfile(localDeviceId?: string) {
  const [status, setStatus] = useState<AuthGateStatus>('checking');
  const [user, setUser] = useState<AuthenticatedUserProfile | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const restoreSession = useCallback(async () => {
    setRestoreError(null);
    try {
      const res = await restoreAuthenticatedSession();
      if (res.authenticated && res.user) {
        setUser(res.user);
        setSessionToken(res.sessionToken ?? null);
        setStatus('authenticated');
      } else {
        setUser(null);
        setSessionToken(null);
        setStatus('unauthenticated');
      }
    } catch (err) {
      setRestoreError(
        err instanceof Error ? err.message : 'Unable to connect to authentication server.'
      );
      setUser(null);
      setSessionToken(null);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const sendOtp = useCallback(
    async (
      purpose: OtpPurpose,
      countryCode: string,
      phoneNumber: string
    ): Promise<
      | { ok: true; data: OtpSendResponse }
      | { ok: false; error: string; code?: string }
    > => {
      try {
        const data = await requestPhoneOtp({ purpose, countryCode, phoneNumber });
        return { ok: true, data };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not send OTP.',
          code: err instanceof ApiRequestError ? err.code : undefined,
        };
      }
    },
    []
  );

  const verifyOtp = useCallback(
    async (
      challengeId: string,
      otpCode: string,
      purpose: OtpPurpose
    ): Promise<{ ok: true; phoneE164: string } | { ok: false; error: string }> => {
      try {
        const res = await verifyPhoneOtp({ challengeId, otpCode, purpose });
        return { ok: true, phoneE164: res.phoneE164 };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'OTP verification failed.',
        };
      }
    },
    []
  );

  const createProfile = useCallback(
    async (input: {
      challengeId: string;
      otpCode?: string;
      fullName: string;
    }): Promise<{ ok: true; user: AuthenticatedUserProfile } | { ok: false; error: string }> => {
      try {
        const res = await completeAccountRegistration({
          challengeId: input.challengeId,
          otpCode: input.otpCode,
          fullName: input.fullName,
          deviceId: localDeviceId,
          platform: detectClientPlatform(),
        });
        setUser(res.user);
        setSessionToken(res.sessionToken);
        setStatus('authenticated');
        return { ok: true, user: res.user };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to create profile.',
        };
      }
    },
    [localDeviceId]
  );

  const recoverWithOtp = useCallback(
    async (input: {
      challengeId: string;
      otpCode?: string;
    }): Promise<{ ok: true; user: AuthenticatedUserProfile } | { ok: false; error: string }> => {
      try {
        const res = await completeAccountOtpLogin({
          challengeId: input.challengeId,
          otpCode: input.otpCode,
          deviceId: localDeviceId,
          platform: detectClientPlatform(),
        });
        setUser(res.user);
        setSessionToken(res.sessionToken);
        setStatus('authenticated');
        return { ok: true, user: res.user };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to recover account.',
        };
      }
    },
    [localDeviceId]
  );

  const updatePermanentProfile = useCallback(
    async (patch: {
      fullName?: string;
      displayName?: string;
      username?: string;
      bio?: string;
      statusNote?: string;
      avatarDataUrl?: string | null;
      showPhoneToPeers?: boolean;
    }): Promise<{ ok: true; user: AuthenticatedUserProfile } | { ok: false; error: string }> => {
      try {
        const res = await patchPermanentProfile(patch);
        setUser(res.user);
        return { ok: true, user: res.user };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to save profile changes.',
        };
      }
    },
    []
  );

  const changePhone = useCallback(
    async (
      challengeId: string,
      otpCode?: string
    ): Promise<{ ok: true; user: AuthenticatedUserProfile } | { ok: false; error: string }> => {
      try {
        const res = await completePhoneNumberChange({ challengeId, otpCode });
        setUser(res.user);
        return { ok: true, user: res.user };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not update phone number.',
        };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await logoutAccountSession();
    } catch {
      // Clear local session state even if network was offline
    }
    setUser(null);
    setSessionToken(null);
    setStatus('unauthenticated');
  }, []);

  const deleteAccount = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      await deletePermanentAccount();
      setUser(null);
      setSessionToken(null);
      setStatus('unauthenticated');
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not delete account.',
      };
    }
  }, []);

  return {
    status,
    user,
    sessionToken,
    restoreError,
    restoreSession,
    sendOtp,
    verifyOtp,
    createProfile,
    recoverWithOtp,
    updatePermanentProfile,
    changePhone,
    logout,
    deleteAccount,
  };
}
