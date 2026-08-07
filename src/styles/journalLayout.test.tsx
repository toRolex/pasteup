import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { JournalShell } from './journalLayout';
import { tokens } from './tokens';

/** 供 seam 3 渲染：stub 内容，避免拉起真实 FabricCanvas。 */
const stubTopbar = <span>topbar</span>;
const stubLeft = <div>left page</div>;
const stubRight = <div>right page</div>;
const stubCanvas = <div data-testid="canvas-stub">canvas area</div>;

function renderShell() {
  render(
    <JournalShell topbar={stubTopbar} leftPage={stubLeft} rightPage={stubRight}>
      {stubCanvas}
    </JournalShell>,
  );
}

type MatchMediaMock = {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
};

function mockMatchMedia(matches: boolean): void {
  const mql: MatchMediaMock = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
}

const normalize = (s: string) => s.replace(/\s+/g, '');

describe('JournalShell（seam 3）— 三栏手帐本骨架', () => {
  it('渲染五个地标：顶栏 / 左页 / 中缝 / 画布 / 右页', () => {
    renderShell();
    expect(screen.getByTestId('journal')).toBeInTheDocument();
    expect(screen.getByTestId('journal-topbar')).toBeInTheDocument();
    expect(screen.getByTestId('journal-left')).toBeInTheDocument();
    expect(screen.getByTestId('journal-spine')).toBeInTheDocument();
    expect(screen.getByTestId('journal-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('journal-right')).toBeInTheDocument();
    // canvas 区域渲染传入的内容
    expect(screen.getByTestId('canvas-stub')).toBeInTheDocument();
  });

  it('grid 尺寸来自 tokens：rows 56px 1fr；columns 260 / 34 / 1fr / 280', () => {
    renderShell();
    const el = screen.getByTestId('journal');
    expect(el.style.gridTemplateRows).toBe(`${tokens.layout.topbar}px 1fr`);
    expect(normalize(el.style.gridTemplateColumns)).toBe(
      normalize(`${tokens.layout.left}px ${tokens.layout.spine}px minmax(0, 1fr) ${tokens.layout.right}px`),
    );
  });

  it('五个区域 grid-area 映射正确（topbar/left/spine/canvas/right）', () => {
    renderShell();
    expect(screen.getByTestId('journal-topbar').style.gridArea).toBe('topbar');
    expect(screen.getByTestId('journal-left').style.gridArea).toBe('left');
    expect(screen.getByTestId('journal-spine').style.gridArea).toBe('spine');
    expect(screen.getByTestId('journal-canvas').style.gridArea).toBe('canvas');
    expect(screen.getByTestId('journal-right').style.gridArea).toBe('right');
  });
});

describe('prefers-reduced-motion 降级（seam 4）', () => {
  beforeEach(() => {
    mockMatchMedia(true);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('系统 reduce 时根节点标 data-reduced-motion="true"', () => {
    renderShell();
    expect(screen.getByTestId('journal')).toHaveAttribute('data-reduced-motion', 'true');
  });

  it('默认（无 reduce）不标降级标记', () => {
    mockMatchMedia(false);
    renderShell();
    expect(screen.getByTestId('journal')).not.toHaveAttribute('data-reduced-motion');
  });
});
