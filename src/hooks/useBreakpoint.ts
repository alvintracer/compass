import { useState, useEffect } from 'react';

type Breakpoint = 'mobile' | 'tablet' | 'desktop';

interface BreakpointInfo {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
}

function getInfo(): BreakpointInfo {
  const w = window.innerWidth;
  const bp: Breakpoint = w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
  return { breakpoint: bp, isMobile: bp === 'mobile', isTablet: bp === 'tablet', isDesktop: bp === 'desktop', width: w };
}

export function useBreakpoint(): BreakpointInfo {
  const [info, setInfo] = useState<BreakpointInfo>(getInfo);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => setInfo(getInfo()), 100);
    };
    window.addEventListener('resize', handler);
    return () => { window.removeEventListener('resize', handler); clearTimeout(timeout); };
  }, []);

  return info;
}
