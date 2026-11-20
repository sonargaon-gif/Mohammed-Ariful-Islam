import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Pause, Play, Volume2 } from 'lucide-react';

interface VoiceMessagePlayerProps {
  src?: string;
  durationSec?: number;
  variant?: 'outgoing' | 'incoming' | 'card';
}

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function VoiceMessagePlayer({
  src,
  durationSec = 0,
  variant = 'outgoing',
}: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(durationSec);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    setTotalDuration(durationSec);
  }, [durationSec]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
      }
    };
  }, []);

  if (!src) {
    return (
      <div className="flex items-center gap-2 text-xs opacity-85 py-1">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Audio data unavailable for this recording.</span>
      </div>
    );
  }

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setPlayError(null);

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
      setPlayError('Unable to play this audio format on this browser.');
    }
  };

  const effectiveDuration =
    totalDuration > 0 && Number.isFinite(totalDuration) ? totalDuration : Math.max(1, durationSec);
  const progressPct = Math.min(100, (currentTime / effectiveDuration) * 100);

  const isLightOnDark = variant === 'outgoing';

  return (
    <div
      className="flex flex-col gap-1.5 min-w-[210px] sm:min-w-[240px]"
      onClick={(e) => e.stopPropagation()}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setTotalDuration(d);
          }
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => void togglePlay()}
          aria-label={playing ? 'Pause voice message' : 'Play voice message'}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
            isLightOnDark
              ? 'bg-white/20 hover:bg-white/30 text-white'
              : 'bg-blue-600/15 dark:bg-cyan-500/20 hover:bg-blue-600/25 text-blue-700 dark:text-cyan-300'
          }`}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-[1px]" />}
        </button>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="relative flex items-center">
            <input
              type="range"
              min={0}
              max={effectiveDuration}
              step={0.1}
              value={Math.min(currentTime, effectiveDuration)}
              onChange={(e) => {
                const next = Number(e.target.value);
                setCurrentTime(next);
                if (audioRef.current) {
                  audioRef.current.currentTime = next;
                }
              }}
              aria-label="Seek voice message"
              className={`w-full h-1.5 rounded-full appearance-none cursor-pointer ${
                isLightOnDark
                  ? 'bg-white/25 accent-white'
                  : 'bg-slate-200 dark:bg-cyan-400/20 accent-blue-600 dark:accent-cyan-300'
              }`}
              style={{
                background: isLightOnDark
                  ? `linear-gradient(to right, rgba(255,255,255,0.9) ${progressPct}%, rgba(255,255,255,0.25) ${progressPct}%)`
                  : undefined,
              }}
            />
          </div>

          <div
            className={`flex items-center justify-between text-[10px] font-mono tabular-nums ${
              isLightOnDark ? 'text-cyan-100/90' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span className="flex items-center gap-1">
              <Volume2 className="w-3 h-3" />
              {formatSeconds(currentTime)}
            </span>
            <span>{formatSeconds(effectiveDuration)}</span>
          </div>
        </div>
      </div>

      {playError && (
        <p className={`text-[10px] ${isLightOnDark ? 'text-amber-200' : 'text-red-500'}`}>
          {playError}
        </p>
      )}
    </div>
  );
}
