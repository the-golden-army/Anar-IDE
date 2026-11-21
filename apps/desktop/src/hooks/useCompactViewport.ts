import { useEffect, useState } from 'react';

export interface ViewportFlags {
  isCompact: boolean;
  isNarrow: boolean;
}

const COMPACT_BREAKPOINT = 768;
const NARROW_BREAKPOINT = 540;

function readFlags(): ViewportFlags {
  if (typeof window === 'undefined') {
    return { isCompact: false, isNarrow: false };
  }
  const w = window.innerWidth;
  return {
    isCompact: w < COMPACT_BREAKPOINT,
    isNarrow: w < NARROW_BREAKPOINT,
  };
}

export function useCompactViewport(): ViewportFlags {
  const [flags, setFlags] = useState<ViewportFlags>(() => readFlags());

  useEffect(() => {
    const onResize = () => {
      setFlags(readFlags());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return flags;
}
