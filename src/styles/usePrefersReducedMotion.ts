/**
 * 共享 hook——跟随系统 prefers-reduced-motion 偏好（jsdom / 旧实现不可用时退化为 false）。
 *
 * T2 起由 JournalShell 使用（标 data-reduced-motion 到书体根节点）；T16 逐字组件
 * CharReveal 也复用它，故提取为本模块单一来源。
 */
import { useEffect, useState } from 'react';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    try {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    } catch {
      // jsdom 等实现不支持 addEventListener，静态读取即可
      return undefined;
    }
  }, []);

  return reduced;
}
