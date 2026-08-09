/**
 * useScreenPicker（S5）——屏幕取色交互编排 hook。
 *
 * 交互契约（issue #38）：
 * - 触发：工具按钮（activate）+ 全工具快捷键（I）。
 * - 正式取色：取到色 → 写入选色并追加 MRU → 自动切回上一工具；取消 → 仅退出。
 * - 临时取色：按住修饰键（Alt/Option）触发，取到色后停留取色，松开修饰键回到原工具。
 * - Esc：取色中取消退出；结果丢弃。
 * - 输入框 / textarea / contentEditable 聚焦时忽略快捷键（不干扰录入）。
 */
import { useCallback, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useToolStore } from '../store/toolStore';
import { pickScreenColorPlatformAware } from './pickScreenColor';

/** 正式取色快捷键（吸管惯例，Photoshop/Illustrator 用 I）。 */
export const PICK_COLOR_SHORTCUT = 'i';
/** 临时取色修饰键（macOS Option / Windows Alt，浏览器统一报 key === "Alt"）。 */
export const PICK_COLOR_MODIFIER = 'Alt';

/** 目标是否为可编辑区（input/textarea/select/contentEditable），是则忽略快捷键。 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * 进入取色 → 系统拾色器 → 写结果 / 退出。
 * 取色期间可能已被 Esc 或松键退出（tool 不再是 picker），此时丢弃结果。
 * 正式取色取完即切回；临时取色停留到修饰键松开。
 */
async function runPick(opts?: { temporary?: boolean }): Promise<void> {
  const toolStore = useToolStore.getState();
  if (toolStore.tool === 'picker') return; // 已在取色中，防重复触发
  toolStore.enterPickColor(opts);
  const hex = await pickScreenColorPlatformAware();
  const state = useToolStore.getState();
  if (state.tool !== 'picker') return; // 取色期间已退出，丢弃结果
  if (hex) useEditorStore.getState().applyPickedColor(hex);
  if (!state.activePickTemporary) {
    useToolStore.getState().exitPickColor();
  }
}

/**
 * 挂载全局 keydown/keyup 监听，返回 `activate`（工具按钮可调用）。
 */
export function useScreenPicker() {
  const activate = useCallback((opts?: { temporary?: boolean }) => {
    void runPick(opts);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isPickMode = useToolStore.getState().tool === 'picker';
      if (e.key === 'Escape' && isPickMode) {
        useToolStore.getState().exitPickColor();
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (e.key === PICK_COLOR_MODIFIER) {
        void runPick({ temporary: true });
        return;
      }
      if (
        e.key.toLowerCase() === PICK_COLOR_SHORTCUT &&
        !isPickMode &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        void runPick();
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key !== PICK_COLOR_MODIFIER) return;
      const state = useToolStore.getState();
      // 临时取色：松开修饰键回到原工具
      if (state.tool === 'picker' && state.activePickTemporary) {
        state.exitPickColor();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return { activate };
}
