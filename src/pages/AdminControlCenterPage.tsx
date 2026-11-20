import { FormEvent, useEffect, useState } from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Database,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  AdminOverviewPayload,
  PairingCodeStatus,
  PairingSessionUser,
} from '../types/pairing';

interface AdminControlCenterPageProps {
  sessionUser: PairingSessionUser | null;
  overview: AdminOverviewPayload | null;
  onUnlockAdmin: (passcode: string) => Promise<{ ok: boolean; error?: string }>;
  onLoadOverview: (
    status?: PairingCodeStatus | 'all',
    search?: string
  ) => Promise<AdminOverviewPayload | null>;
  onGenerateCodes: (count: number) => Promise<{ ok: boolean; message: string }>;
  onDisableCode: (code: string, reason: string) => Promise<{ ok: boolean; message: string }>;
  onRecycleExpired: () => Promise<{ ok: boolean; message: string }>;
}

export function AdminControlCenterPage({
  sessionUser,
  overview,
  onUnlockAdmin,
  onLoadOverview,
  onGenerateCodes,
  onDisableCode,
  onRecycleExpired,
}: AdminControlCenterPageProps) {
  const [passcode, setPasscode] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [statusFilter, setStatusFilter] = useState<PairingCodeStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const [disableCodeInput, setDisableCodeInput] = useState('');
  const [disableReasonInput, setDisableReasonInput] = useState('Suspicious verification activity');

  const isAdmin = sessionUser?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    void onLoadOverview(statusFilter, searchQuery).finally(() => setLoading(false));
  }, [isAdmin, statusFilter, searchQuery, onLoadOverview]);

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    setUnlocking(true);
    try {
      const res = await onUnlockAdmin(passcode);
      if (!res.ok) {
        setUnlockError(res.error ?? 'Invalid Admin Access Code.');
      } else {
        setPasscode('');
      }
    } finally {
      setUnlocking(false);
    }
  };

  const handleGenerate = async (count: number) => {
    setBusyAction(`gen-${count}`);
    setNotice(null);
    try {
      const res = await onGenerateCodes(count);
      setNotice({ ok: res.ok, text: res.message });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisableSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusyAction('disable-form');
    setNotice(null);
    try {
      const res = await onDisableCode(disableCodeInput, disableReasonInput);
      setNotice({ ok: res.ok, text: res.message });
      if (res.ok) setDisableCodeInput('');
    } finally {
      setBusyAction(null);
    }
  };

  const handleQuickDisable = async (code: string) => {
    setBusyAction(`disable-${code}`);
    setNotice(null);
    try {
      const res = await onDisableCode(code, 'Disabled by administrator from Control Center');
      setNotice({ ok: res.ok, text: res.message });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRecycle = async () => {
    setBusyAction('recycle');
    setNotice(null);
    try {
      const res = await onRecycleExpired();
      setNotice({ ok: res.ok, text: res.message });
    } finally {
      setBusyAction(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto my-8 rounded-3xl bg-[#06152E] text-white border border-[#168BFF]/40 p-7 space-y-5 shadow-[0_24px_80px_rgba(6,21,46,0.75)]">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#168BFF] to-[#38D9FF] flex items-center justify-center">
          <Lock className="w-6 h-6 text-[#06152E]" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-extrabold">Admin Control Center</h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            Administrator authorization is required to inspect backend code pool statistics,
            generate new pairing codes, disable suspicious codes, or view connection error logs.
          </p>
        </div>

        <form onSubmit={(e) => void handleUnlock(e)} className="space-y-3">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter server Admin Access Code"
            className="w-full h-11 px-4 rounded-xl bg-[#0A1F40] border border-[#123B68] text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-[#38D9FF]"
          />
          {unlockError && <p className="text-xs text-rose-300">{unlockError}</p>}
          <button
            type="submit"
            disabled={unlocking || !passcode.trim()}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 disabled:opacity-50 text-[#06152E] text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
          >
            {unlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Verify Admin Access
          </button>
        </form>
      </div>
    );
  }

  const stats = overview?.stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl bg-[#06152E] text-white border border-[#168BFF]/35 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-[#38D9FF]">
            Backend Pairing Security &amp; Pool Operations
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight mt-0.5">Admin Control Center</h1>
          <p className="text-xs text-slate-300 mt-1">
            Monitor pre-generated 6-digit pairing codes, active private connections, rate limits,
            and security events.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={busyAction === 'recycle'}
            onClick={() => void handleRecycle()}
            className="px-3.5 h-10 rounded-xl bg-[#0A1F40] hover:bg-[#123B68] border border-[#123B68] text-xs font-semibold text-slate-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#38D9FF] ${busyAction === 'recycle' ? 'animate-spin' : ''}`} />
            Release Expired Codes
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              void onLoadOverview(statusFilter, searchQuery).finally(() => setLoading(false));
            }}
            className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] text-[#06152E] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Telemetry
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 border text-xs flex items-center gap-2 ${
            notice.ok
              ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-700 dark:text-emerald-200'
              : 'bg-rose-500/15 border-rose-400/45 text-rose-700 dark:text-rose-200'
          }`}
        >
          {notice.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Primary KPI Grid (Tabular Numerals) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {[
          { label: 'Total Generated', value: stats?.totalGenerated ?? 0, tone: 'text-slate-900 dark:text-white' },
          { label: 'Available Codes', value: stats?.availableCodes ?? 0, tone: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Claimed Codes', value: stats?.claimedCodes ?? 0, tone: 'text-blue-600 dark:text-[#38D9FF]' },
          { label: 'Expired Codes', value: stats ? stats.expiredCodes + stats.totalExpiredEvents : 0, tone: 'text-amber-600 dark:text-amber-300' },
          { label: 'Disabled Codes', value: stats?.disabledCodes ?? 0, tone: 'text-rose-600 dark:text-rose-400' },
          { label: 'Active Connections', value: stats?.activeConnections ?? 0, tone: 'text-emerald-600 dark:text-emerald-300' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl bg-white dark:bg-[#07152C]/85 border border-slate-200 dark:border-[#123B68] p-4 space-y-1"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</p>
            <p className={`text-2xl font-extrabold font-mono tabular-nums ${kpi.tone}`}>
              {kpi.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Controls Row: Generate Codes + Disable Suspicious Code */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Generate Additional Random Codes */}
        <section className="rounded-2xl bg-white dark:bg-[#07152C]/85 border border-slate-200 dark:border-[#123B68] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600 dark:text-[#38D9FF]" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Generate Additional Random Codes
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Uses Node <code className="font-mono">crypto.randomInt</code> inside an atomic SQLite
            transaction to append guaranteed-unique 6-digit codes into the backend pool.
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            {[100, 500, 1000].map((amount) => (
              <button
                key={amount}
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleGenerate(amount)}
                className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#168BFF] to-[#38D9FF] hover:brightness-110 disabled:opacity-50 text-[#06152E] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                {busyAction === `gen-${amount}` ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                Generate +{amount.toLocaleString()} Codes
              </button>
            ))}
          </div>
        </section>

        {/* Disable Suspicious Code */}
        <section className="rounded-2xl bg-white dark:bg-[#07152C]/85 border border-slate-200 dark:border-[#123B68] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-rose-500 dark:text-rose-400" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Disable Suspicious Code
            </h2>
          </div>
          <form onSubmit={(e) => void handleDisableSubmit(e)} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={disableCodeInput}
                onChange={(e) => setDisableCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                className="sm:col-span-4 h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#06152E] border border-slate-300 dark:border-[#123B68] font-mono tabular-nums text-xs text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={disableReasonInput}
                onChange={(e) => setDisableReasonInput(e.target.value)}
                placeholder="Reason for disabling"
                className="sm:col-span-5 h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#06152E] border border-slate-300 dark:border-[#123B68] text-xs text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={busyAction !== null || disableCodeInput.length !== 6}
                className="sm:col-span-3 h-10 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap cursor-pointer"
              >
                Disable Code
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Code Pool Inspector Table */}
      <section className="rounded-2xl bg-white dark:bg-[#07152C]/85 border border-slate-200 dark:border-[#123B68] overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-[#123B68] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-600 dark:text-[#38D9FF]" />
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Pairing Code Inspector (Sample View — Full DB Protected)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#06152E]">
              {(['all', 'claimed', 'available', 'used', 'expired', 'disabled'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize cursor-pointer ${
                    statusFilter === st
                      ? 'bg-[#168BFF] text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                inputMode="numeric"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Search code..."
                className="h-8 pl-8 pr-3 w-36 rounded-lg bg-slate-50 dark:bg-[#06152E] border border-slate-300 dark:border-[#123B68] font-mono text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#06152E]/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[#123B68]">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Code</th>
                <th className="py-2.5 px-4 font-semibold">Status</th>
                <th className="py-2.5 px-4 font-semibold">Claimed By</th>
                <th className="py-2.5 px-4 font-semibold">Expires / Used</th>
                <th className="py-2.5 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#123B68]/60">
              {(overview?.codes ?? []).map((row) => (
                <tr key={row.code} className="hover:bg-slate-50 dark:hover:bg-[#0A1F40]/50">
                  <td className="py-2.5 px-4 font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                    {row.code}
                  </td>
                  <td className="py-2.5 px-4 capitalize font-semibold">
                    <span
                      className={
                        row.status === 'available'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : row.status === 'claimed'
                            ? 'text-blue-600 dark:text-[#38D9FF]'
                            : row.status === 'disabled'
                              ? 'text-rose-600 dark:text-rose-400'
                              : row.status === 'expired'
                                ? 'text-amber-600 dark:text-amber-300'
                                : 'text-slate-500 dark:text-slate-400'
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                    {row.claimedByUsername ? `${row.claimedByName} (${row.claimedByUsername})` : '—'}
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {row.disabledReason
                      ? row.disabledReason
                      : row.usedAt
                        ? `Used ${new Date(row.usedAt).toLocaleTimeString()}`
                        : row.expiresAt
                          ? `Exp ${new Date(row.expiresAt).toLocaleTimeString()}`
                          : 'Ready in pool'}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {row.status !== 'disabled' && (
                      <button
                        type="button"
                        disabled={busyAction === `disable-${row.code}`}
                        onClick={() => void handleQuickDisable(row.code)}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 font-semibold cursor-pointer"
                      >
                        Disable
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom Split: Active Connections + Connection Errors Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="rounded-2xl bg-white dark:bg-[#07152C]/85 border border-slate-200 dark:border-[#123B68] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600 dark:text-[#38D9FF]" />
              Active &amp; Recent Connections
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {overview?.connections.length ?? 0} rooms
            </span>
          </div>

          {(overview?.connections ?? []).length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              No paired private connections recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-[#123B68]">
              {(overview?.connections ?? []).map((conn) => (
                <div key={conn.roomId} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">
                      {conn.userAName} ↔ {conn.userBName}
                    </p>
                    <p className="font-mono text-slate-500 dark:text-slate-400">
                      Code {conn.code} · {conn.messageCount} msgs ·{' '}
                      {new Date(conn.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <span
                    className={`font-mono font-bold shrink-0 ${
                      conn.status === 'active'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {conn.status === 'active' ? 'Active' : 'Closed'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white dark:bg-[#07152C]/85 border border-slate-200 dark:border-[#123B68] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 dark:text-amber-300" />
              Connection Errors &amp; Security Monitor
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {overview?.events.length ?? 0} events
            </span>
          </div>

          {(overview?.events ?? []).length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              No connection errors or security events recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-[#123B68] max-h-80 overflow-y-auto">
              {(overview?.events ?? []).map((ev) => (
                <div key={ev.id} className="py-2.5 first:pt-0 last:pb-0 space-y-0.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-mono font-bold ${
                        ev.severity === 'error'
                          ? 'text-rose-600 dark:text-rose-400'
                          : ev.severity === 'warn'
                            ? 'text-amber-600 dark:text-amber-300'
                            : 'text-blue-600 dark:text-[#38D9FF]'
                      }`}
                    >
                      {ev.eventType}
                      {ev.code ? ` · ${ev.code}` : ''}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-400">
                      {new Date(ev.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">{ev.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
