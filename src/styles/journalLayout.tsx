/**
 * JournalShell —— 摊开手帐本三栏骨架（顶栏 / 左目录页 / 中缝 / 画布 / 右页）。
 *
 * 信息架构零卡片：骨架承载靠胶带 / 便利贴 / 撕边拟物（见 journal.css）。
 * 三栏 grid 尺寸直接来自 `tokens.layout`，经 inline style 下发——jsdom 可测，
 * 且运行时与 DESIGN.md 契约严格一致。prefers-reduced-motion 经 hook 标到根节点。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { tokens } from './tokens';

export interface JournalShellProps {
  topbar: ReactNode;
  leftPage: ReactNode;
  rightPage: ReactNode;
  /** 画布区域内容（拼贴留白页）。 */
  children: ReactNode;
}

/** 跟随系统 prefers-reduced-motion 偏好（jsdom / 旧实现不可用时退化为 false）。 */
function usePrefersReducedMotion(): boolean {
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

export function JournalShell({ topbar, leftPage, rightPage, children }: JournalShellProps) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div
      className="journal"
      data-testid="journal"
      data-reduced-motion={reducedMotion ? 'true' : undefined}
      style={{
        display: 'grid',
        gridTemplateRows: `${tokens.layout.topbar}px 1fr`,
        gridTemplateColumns: `${tokens.layout.left}px ${tokens.layout.spine}px minmax(0, 1fr) ${tokens.layout.right}px`,
        gridTemplateAreas: '"topbar topbar topbar topbar" "left spine canvas right"',
      }}
    >
      <header className="journal-topbar" data-testid="journal-topbar" style={{ gridArea: 'topbar' }}>
        {topbar}
      </header>
      <aside className="journal-left" data-testid="journal-left" style={{ gridArea: 'left' }}>
        {leftPage}
      </aside>
      <div className="spine" data-testid="journal-spine" style={{ gridArea: 'spine' }} />
      <main className="journal-canvas" data-testid="journal-canvas" style={{ gridArea: 'canvas' }}>
        {children}
      </main>
      <aside className="journal-right" data-testid="journal-right" style={{ gridArea: 'right' }}>
        {rightPage}
      </aside>
    </div>
  );
}
