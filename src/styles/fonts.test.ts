import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FONTS_DIR = resolve(process.cwd(), 'src/assets/fonts');
const FONTS_CSS = resolve(process.cwd(), 'src/styles/fonts.css');

/** 与 issue #25「字体资产」契约一一对应：7 个 woff2 = 5 个家族。 */
const EXPECTED_FACES = [
  { family: 'Caveat', weight: 600, file: 'caveat-600.woff2' },
  { family: 'ZCOOL KuaiLe', weight: 400, file: 'zcool-kuaile-400.woff2' },
  { family: 'Nunito', weight: 400, file: 'nunito-400.woff2' },
  { family: 'Nunito', weight: 600, file: 'nunito-600.woff2' },
  { family: 'Nunito', weight: 700, file: 'nunito-700.woff2' },
  { family: 'Ma Shan Zheng', weight: 400, file: 'ma-shan-zheng-400.woff2' },
  { family: 'Liu Jian Mao Cao', weight: 400, file: 'liu-jian-mao-cao-400.woff2' },
] as const;

describe('fonts（seam 2）— 本地打包、离线无外发', () => {
  it('7 个 woff2 资产存在于 src/assets/fonts/', () => {
    for (const face of EXPECTED_FACES) {
      expect(existsSync(resolve(FONTS_DIR, face.file)), `缺少 ${face.file}`).toBe(true);
    }
  });

  it('fonts.css 声明全部 family/weight 且 url 指向本地相对路径（无 http/https）', () => {
    const css = readFileSync(FONTS_CSS, 'utf8');
    for (const face of EXPECTED_FACES) {
      expect(css, `缺少 @font-face for ${face.family} ${face.weight}`).toMatch(
        new RegExp(`font-family:\\s*['"]${face.family}['"]`),
      );
      expect(css, `缺少 ${face.weight} 字重`).toMatch(
        new RegExp(`font-weight:\\s*${face.weight}`),
      );
      expect(css, `缺少资产引用 ${face.file}`).toContain(face.file);
    }
    expect(css).not.toMatch(/https?:/);
  });

  it('保留 OFL 1.1 许可（含 SIL OPEN FONT LICENSE 文本）', () => {
    const ofl = readFileSync(resolve(FONTS_DIR, 'OFL.txt'), 'utf8');
    expect(ofl).toMatch(/SIL OPEN FONT LICENSE/i);
  });
});
