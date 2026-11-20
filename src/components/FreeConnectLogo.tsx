import { useId, useState } from 'react';

export const FREECONNECT_LOGO_IMAGE =
  '/src/assets/images/freeconnect_brand_logo_1795108070417.jpg';

export type FreeConnectLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';

const SIZE_CLASSES: Record<
  FreeConnectLogoSize,
  { box: string; radius: string; shadow: string }
> = {
  xs: {
    box: 'w-6 h-6',
    radius: 'rounded-md',
    shadow: 'shadow-[0_2px_10px_rgba(22,139,255,0.28)]',
  },
  sm: {
    box: 'w-8 h-8',
    radius: 'rounded-lg',
    shadow: 'shadow-[0_4px_14px_rgba(22,139,255,0.32)]',
  },
  md: {
    box: 'w-10 h-10',
    radius: 'rounded-xl',
    shadow: 'shadow-[0_6px_20px_rgba(22,139,255,0.38)]',
  },
  lg: {
    box: 'w-14 h-14',
    radius: 'rounded-2xl',
    shadow: 'shadow-[0_10px_28px_rgba(22,139,255,0.42)]',
  },
  xl: {
    box: 'w-20 h-20',
    radius: 'rounded-[22px]',
    shadow: 'shadow-[0_14px_38px_rgba(22,139,255,0.45)]',
  },
  hero: {
    box: 'w-24 h-24 sm:w-28 sm:h-28',
    radius: 'rounded-[26px]',
    shadow: 'shadow-[0_18px_48px_rgba(22,139,255,0.52)]',
  },
};

/**
 * Pure precision geometric vector version of the FreeConnect brand mark:
 * interlocking infinity link + dual wireless signal arcs on deep Navy slate.
 * Used as the zero-broken-image fallback and crisp icon mark.
 */
export function FreeConnectVectorMark({ className = 'w-full h-full' }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  const bgId = `fc-bg-${uid}`;
  const gradId = `fc-arc-${uid}`;
  const coreId = `fc-core-${uid}`;

  return (
    <svg
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={bgId} x1="12" y1="8" x2="116" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#122B56" />
          <stop offset="55%" stopColor="#081A3A" />
          <stop offset="100%" stopColor="#040D20" />
        </linearGradient>
        <linearGradient id={gradId} x1="18" y1="30" x2="110" y2="98" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6CE9FF" />
          <stop offset="48%" stopColor="#38D9FF" />
          <stop offset="100%" stopColor="#168BFF" />
        </linearGradient>
        <linearGradient id={coreId} x1="36" y1="42" x2="92" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#B8F6FF" />
          <stop offset="55%" stopColor="#38D9FF" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
      </defs>

      {/* Deep Navy Squircle Base */}
      <rect width="128" height="128" rx="28" fill={`url(#${bgId})`} />
      <rect
        x="2"
        y="2"
        width="124"
        height="124"
        rx="26"
        stroke="rgba(125, 211, 252, 0.35)"
        strokeWidth="2"
      />

      {/* Outer Wireless Signal Arcs */}
      <path
        d="M32 37C20.5 49 20.5 79 32 91"
        stroke={`url(#${gradId})`}
        strokeWidth="6.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M96 37C107.5 49 107.5 79 96 91"
        stroke={`url(#${gradId})`}
        strokeWidth="6.5"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Inner Wireless Signal Arcs */}
      <path
        d="M42 45C33.5 54 33.5 74 42 83"
        stroke={`url(#${gradId})`}
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <path
        d="M86 45C94.5 54 94.5 74 86 83"
        stroke={`url(#${gradId})`}
        strokeWidth="6.5"
        strokeLinecap="round"
      />

      {/* Interlocking Infinity Peer-to-Peer Core */}
      <path
        d="M47 52C52.5 46.5 60 49 64 56.5C68 64 75.5 66.5 81 61C86.5 55.5 86.5 46.5 81 42C75.5 37.5 68 41 64 49.5L56 64.5C52 72.5 45 76 39.5 71.5"
        stroke={`url(#${coreId})`}
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(3 8)"
      />
      <path
        d="M47 76C52.5 81.5 60 79 64 71.5L72 56.5C76 49 83.5 46.5 89 52"
        stroke={`url(#${coreId})`}
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.92"
        transform="translate(-4 0)"
      />
    </svg>
  );
}

interface FreeConnectLogoMarkProps {
  size?: FreeConnectLogoSize;
  className?: string;
  alt?: string;
}

/**
 * Primary FreeConnect Brand Emblem:
 * Uses the bespoke metallic sapphire-and-cyan infinity signal emblem artwork,
 * seamlessly cropped to the squircle edge with a crisp vector SVG fallback.
 */
export function FreeConnectLogoMark({
  size = 'md',
  className = '',
  alt = 'FreeConnect emblem',
}: FreeConnectLogoMarkProps) {
  const [imgError, setImgError] = useState(false);
  const spec = SIZE_CLASSES[size];

  return (
    <div
      className={`relative overflow-hidden shrink-0 select-none bg-[#06152E] border border-cyan-300/35 ${spec.box} ${spec.radius} ${spec.shadow} ${className}`}
    >
      {!imgError ? (
        <img
          src={FREECONNECT_LOGO_IMAGE}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover scale-[1.26] pointer-events-none"
        />
      ) : (
        <FreeConnectVectorMark className="w-full h-full" />
      )}
    </div>
  );
}

interface FreeConnectWordmarkProps {
  size?: 'sm' | 'md';
  showTagline?: boolean;
  className?: string;
}

export function FreeConnectWordmark({
  size = 'md',
  showTagline = false,
  className = '',
}: FreeConnectWordmarkProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      <FreeConnectLogoMark size={size === 'sm' ? 'sm' : 'md'} />
      <span className="flex flex-col text-left leading-none">
        <span
          className={`font-extrabold tracking-[0.11em] text-slate-900 dark:text-white whitespace-nowrap ${
            size === 'sm' ? 'text-sm' : 'text-[15px]'
          }`}
        >
          FREE
          <span className="bg-gradient-to-r from-[#168BFF] to-[#38D9FF] bg-clip-text text-transparent">
            CONNECT
          </span>
        </span>
        {showTagline && (
          <span className="text-[10px] font-mono tracking-[0.14em] text-blue-600 dark:text-cyan-300/90 mt-1 whitespace-nowrap">
            100% OFFLINE
          </span>
        )}
      </span>
    </span>
  );
}
