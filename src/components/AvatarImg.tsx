import { useState } from 'react';

interface AvatarImgProps {
  src: string;
  alt: string;
  initials: string;
  sizeClass?: string;
}

export function AvatarImg({
  src,
  alt,
  initials,
  sizeClass = 'w-10 h-10',
}: AvatarImgProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`${sizeClass} rounded-full bg-[#1D4ED8] text-white font-semibold text-xs flex items-center justify-center shrink-0 select-none`}
        aria-label={alt}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} rounded-full object-cover shrink-0 bg-[#132440]`}
    />
  );
}
