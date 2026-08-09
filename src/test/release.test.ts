/**
 * T17 发布打包 — 版本号对齐 + tauri.conf.json bundle 配置结构。
 *
 * 非逻辑 seam：读取三处 manifest（package.json / Cargo.toml / tauri.conf.json），
 * 断言版本一致且符合 semver；bundle 声明 macOS（app/dmg）与 Windows（msi/nsis）
 * 双平台 targets，且 bundle.icon 引用已落盘的平台图标（.icns / .ico）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SEMVER = /^\d+\.\d+\.\d+$/;

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf-8')) as Record<string, unknown>;
}

function readCargoVersion(): string | undefined {
  const cargo = readFileSync(resolve(ROOT, 'src-tauri/Cargo.toml'), 'utf-8');
  return cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
}

describe('T17 发布 — 版本号对齐', () => {
  it('package.json / Cargo.toml / tauri.conf.json 三处 version 一致且为 semver', () => {
    const pkg = readJson('package.json');
    const conf = readJson('src-tauri/tauri.conf.json');
    const cargoVersion = readCargoVersion();

    expect(cargoVersion).toBeTruthy();
    expect(pkg.version).toMatch(SEMVER);
    expect(conf.version).toMatch(SEMVER);
    expect(pkg.version).toBe(conf.version);
    expect(pkg.version).toBe(cargoVersion);
  });
});

interface BundleConfig {
  active?: boolean;
  targets?: string[] | string;
  icon?: string[];
}

describe('T17 发布 — tauri.conf.json bundle 配置', () => {
  const conf = readJson('src-tauri/tauri.conf.json') as { bundle?: BundleConfig };

  it('bundle.active 为 true', () => {
    expect(conf.bundle?.active).toBe(true);
  });

  it('bundle.targets 覆盖 macOS（app/dmg）与 Windows（msi/nsis）', () => {
    const targets = conf.bundle?.targets;
    expect(Array.isArray(targets)).toBe(true);
    expect(targets as string[]).toEqual(
      expect.arrayContaining(['app', 'dmg', 'msi', 'nsis']),
    );
  });

  it('bundle.icon 引用 .icns 与 .ico 且文件均已落盘', () => {
    const icons = conf.bundle?.icon ?? [];
    expect(icons.some((icon) => icon.endsWith('.icns'))).toBe(true);
    expect(icons.some((icon) => icon.endsWith('.ico'))).toBe(true);
    for (const icon of icons) {
      const abs = resolve(ROOT, 'src-tauri', icon);
      expect(existsSync(abs), `bundle.icon 引用缺失：${icon}`).toBe(true);
    }
  });
});
