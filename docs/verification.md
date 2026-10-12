# 验证记录

环境：DSH `0.2.0-rc.2`，profile `tauri`，Web 端 `http://127.0.0.1:3080`，
Windows，Chromium（Playwright）。以下断言都是在该环境实测得到的。

## 加载与遮蔽

- 组合热重载后浏览器条目出现，`plugins/??dsh-reasoning-slider/client.js` 返回 `200`，
  `Content-Type: text/javascript`。
- 控制台 `0 error`（安装前后、改版前后复核一致；5 条 warning 均为无关注释提示）。
- DOM 断言：`.rs-trigger` 数量 = `1`，官方 `._7KE1Ra_trigger` 数量 = `0` → 优先级 `-1` 遮蔽成功。
- 官方插件未被禁用：其 `modelDirectories` 服务仍在提供数据（本插件的模型列表即来自它），
  `/model` 指令弹窗照旧可用。

## 交互

- **指针拖拽**（合成 `PointerEvent`，左端 → 90%）：拖动中途预览为 `Max`，松手提交
  `aria-valuenow` = `4/4`，触发按钮同步为 `DeepSeek-V41-Flash Max`，重置按钮变为可用。
- **键盘**：`←` / `→` / `↑` / `↓` 逐档切换，`Home` / `End` 跳到两端；指针按下时显式
  `focus()`，因此拖拽后键盘仍然可用（`document.activeElement.className` = `rs-slider`）。
- **点击轨道**任意位置直接跳到最近档位。
- **重置按钮**：处于默认档 `High` 时置灰（`rgb(225,229,238)`），切到 `Max` 后可用，点击回到
  `High` 并重新置灰。
- **模型二级菜单**：5 个选项 + 搜索框（`搜索模型…`）+ 当前模型勾选 + 失败重试，均正常。
- **持久化**：刷新页面后档位保持（`select()` 已落库）。

## 尺寸与配色

| 项目 | 浅色 | 深色 |
| --- | --- | --- |
| 卡片 | 288×105，`rgb(255,255,255)` | `rgb(44,44,46)` |
| 卡片圆角 | 16px | 16px |
| 轨道 | 260×26，`color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)` | 12% 白色叠加 ≈ `#454648` |
| 填充 / 档位文字 | `rgb(65,118,230)` | `rgb(122,170,255)` |
| 档位圆点（未到达） | `rgb(173,178,184)` | `rgb(129,133,140)` |
| 滑块 | 26px 白色圆形，圆心落在填充右端 | 同左 |

- 深色主题通过 `body[data-ds-dark-theme]` 复现（两套调色板在同一张样式表里）。
- 触发按钮未打开菜单时的高度为 28px，与官方一致；卡片宽度 288px（未到达官方 `.menu` 的
  240px 下限，因此不被 `min-width` 撑开）。
