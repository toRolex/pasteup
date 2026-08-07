# 02 · 活纹理 LAB PAPER

**概念一句话**：把 6 种程序纹理（褶皱 / 水彩晕染 / 颗粒 / 织物拉丝 / 大理石纹 / 纤维）做成活的——每个纹理磁贴与纸片填充都由 canvas 实时生成、seed 驱动，整界面是一间冷静的「纸张实验室」。

## 技法清单

1. **Canvas 程序纹理生成（手写 Value Noise + fBm）** — 6 个生成器共享一套确定性噪声基元：`hash2 → valueNoise → fbm`。褶皱用 ridged fBm + 噪声翘曲；水彩用低频斑块 + 高频边缘晕染；颗粒用逐像素 hash；织物用周期线程 + 噪声弯曲；大理石用 `sin(x·freq + turb·amp)`；纤维用各向异性拉伸噪声（sx≫sy）。生成器签名 `(seed, style, scale) → 灰度明度层`，与颜色完全解耦。
2. **Seed 驱动随机 + 结构哈希（ST）** — 同一 seed + 风格必产出完全一致的明度层（可验证）；换 seed 结构即变。luma 经 FNV 哈希折叠成 4 位 hex「ST 结构哈希」，与「CH 色值」分开展示，直接证明 issue #22 wayfinder #9/#10 视觉成立。
3. **每张纸片独立 re-seed** — 属性栏 seed 刷新按钮只重取样选中纸片；「全部重新取样」刷新全部纸片 + 6 路磁贴；双击画布空白处以随机 seed 取样新纸片。
4. **纹理缩放 / 旋转实时重合成** — 缩放滑块（50%–200%）改变生成器空间频率并重新合成纸片画布（防抖 70ms）；旋转 90° 按钮 + CSS transform 实时回写。控件读写均带数值跳动动效。
5. **数值读数动效（mono 字体跳动）** — 双机制：`monoJump`（弹跳式 tick）用于百分比/坐标；`rollValue`（odometer 式逐字符级联滚动）用于 hex 读数（seed / ST / CH / 磁贴 seed / 全局 seed）。
6. **自定义 easing** — `--ease-out-expo` / `--ease-lab` 负责宏动效；`--ease-pop` / `--ease-spring` 只用于微交互（数值跳动、磁贴重取样闪烁、按钮按压），禁裸 linear。
7. **对照实验（prove 道具）** — 画布上钉着一张「对照实验」便签：同一 seed、两种颜色（苔绿/棕褐）并排渲染，ST 结构哈希完全一致，直观证明「色」与「结构」解耦。
8. **实验室叙事细节** — 方格坐标纸底、底图「photo.jpg」的描摹叶线幽灵、光标/悬停读数（`x,y` / `纹理·seed·L`）、`norm L` 光值读数、`ms/帧` 合成耗时、磁贴悬停抬升、品牌 logo 连点 5 次触发「实验室自检」彩蛋。

## 关键构建决策

- **颜色稳定 = 架构保证**：生成器只输出灰度 luma；上色在最后一步 `luma × 色` 完成。因此换色必然不改变结构——这是结构/颜色解耦的本质，不是 UI 技巧。
- **画布尺寸策略**：纸片以 `w·dpr`（dpr 封顶 1.5）生成，luma 按参数 key 缓存（LRU 上限 26 项），滑块调节只重算受影响纸片，`ms/帧` 读数可见。
- **移动端 fit 缩放**：画布内容坐标系固定 900×770，`plane-scale` 按 `min(planeW/900, planeH/770)` 自适应缩放，桌面为 1、小屏自动收缩，390px 不塌。
- **可访问性**：正文墨褐 `#5A4634` 对比 7.3:1；辅助 mono `#6E5640` 5.6:1；主按钮/激活工具用深苔绿 `#5F6E45`（白字 4.8:1，hover `#64724A` 4.6:1）；`prefers-reduced-motion` 关闭跳动/闪烁/行走蚁线。
- **设计钩子处理**：两处 bounce easing 仅作用于「数值跳动」微交互，属 brief 要求的 mono 跳动动效，刻意保留。

## 截图路径

- `shots/desktop-top.png`（1440×900 首屏）
- `shots/desktop-mid.png` / `shots/desktop-bottom.png`
- `shots/mobile-top.png` / `shots/mobile-bottom.png`（390×844 堆叠）

## 运行

```bash
uv run --no-project python -m http.server 8421 --directory .
# 打开 http://localhost:8421/
```

交付检查：console 零报错；桌面 docHeight 900（无页面滚动）；移动端 docHeight 1753（自然滚动、无横向溢出）。
