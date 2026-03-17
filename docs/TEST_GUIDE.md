# AgentOffice UI 测试指南

本文档描述如何验证 Office 和 Terminal 界面重新设计的正确性。测试通过 Chrome DevTools MCP 工具进行截图和交互验证。测试模型应自行记录每步结果，最终给出通过/不通过的判定。

---

## 1. 环境准备

### 1.1 启动服务

```bash
# 在项目根目录执行
node packages/cli/src/index.js start
```

服务启动后会输出类似：
```
AgentOffice listening on http://127.0.0.1:8765
```

### 1.2 启动 Claude Worker（另开终端）

```bash
node packages/cli/src/index.js claude
```

创建一个 tmux-backed Claude 会话并注册到服务端。非交互式 shell 中 tmux attach 会失败，但会话仍会注册。

### 1.3 确认服务可访问

通过 MCP 打开页面：
```
new_page → url: http://127.0.0.1:8765
```

---

## 2. 测试范围

| 页面 | URL | 说明 |
|------|-----|------|
| Office（主页） | `http://127.0.0.1:8765/#/` | Worker 状态总览、Quick Launch |
| Terminal（终端） | `http://127.0.0.1:8765/#/terminal/{sessionId}` | 终端实时视图 + Session 信息 |

Login 和 Dashboard 页面不在本次修改范围内，无需测试。

---

## 3. Office 页面 — 桌面端

**MCP 操作步骤：**
```
emulate → viewport: "1440x900x1"
navigate_page → url: http://127.0.0.1:8765/#/
take_screenshot
```

**验证要点：**

页面左上角应有品牌标记（铁锈色圆角方块 + globe SVG 图标）、"AGENTOFFICE" eyebrow 小字、"Office" 标题使用 DM Serif Display 衬线字体。右上角有 `N active` pill 和带绿色圆点的 `online` 状态 pill。

主体为两列布局：左侧 Office Floor 面板，右侧 Quick Launch 面板。面板使用 `#fffbf5` 奶白背景、`1px` 边框（不是粗 3px）、`20px` 圆角、柔和投影。

Office Floor 内有 2×2 网格的四个 zone：Office Floor（淡紫）、Approval Desk（暖橙）、Attention Desk（粉红）、Idle（米色）。Zone 使用降低饱和度的颜色背景 + `1px` 边框。有 worker 的 zone 显示 provider 图标 + 标题 + 状态的卡片；空 zone 显示虚线边框 "No workers here."。

右侧 Quick Launch 有两个铁锈色全宽按钮（Launch Claude / Launch Codex），底部有 legend 图例（四色 + 名称 + 描述）。

---

## 4. Office 页面 — 移动端

**MCP 操作步骤：**
```
emulate → viewport: "375x812x2,mobile,touch"
navigate_page → url: http://127.0.0.1:8765/#/
take_screenshot → fullPage: true
```

**验证要点：**

四个 zone 必须保持 **2×2 网格**，不能变成单列堆叠。Zone 描述文字隐藏，只显示标题 + 计数 badge。Worker 卡片变为紧凑行布局（小图标 + 名称一行），provider/状态详情文字隐藏。空状态区域高度很小。

关键指标：Office Floor 面板 + 四个 zone + Quick Launch 按钮全部在首屏可见，用户无需滚动即可看到 Launch 按钮。

Quick Launch 按钮纵向全宽排列。Legend 图例完全隐藏。Section 描述文字（"Four states on top of..."）隐藏。

---

## 5. Terminal 页面 — 桌面端

**MCP 操作步骤：**

先进入终端页面：
```
evaluate_script → () => {
  const btn = document.querySelector('[data-session-id]');
  if (btn) location.hash = '#/terminal/' + btn.dataset.sessionId;
}
emulate → viewport: "1440x900x1"
take_screenshot
```

**验证要点：**

顶部 topbar：左侧 "← Office" 返回按钮 + "TERMINAL" eyebrow + 会话标题（DM Serif Display 字体）+ "provider · state" 副标题；右侧状态 pill。Topbar 有 `1px` 底部边框和毛玻璃背景效果。

主体为左右两列：左侧终端（深色 `#151311` 背景，`1px` 边框 + `14px` 圆角），右侧 sidebar（奶白背景）。

Sidebar 分三个区块：
- **SESSION** — metadata 使用 `<dl>` grid 布局（左列 label 灰色，右列值黑色），包含 Provider、Mode、Transport、Status、CWD、Command、PID 等字段，tmux 会话还会显示 tmux session name 和 Attach 命令
- **CONNECTION** — 连接状态或警告信息
- **RECENT LOGS** — 等宽字体 log box，`#faf7f2` 浅色背景

---

## 6. Terminal 页面 — 移动端

**MCP 操作步骤：**
```
emulate → viewport: "375x812x2,mobile,touch"
take_screenshot → fullPage: true
```

**验证要点：**

布局必须为**上下结构**，不是浮层或弹出面板。终端占据上方约 45vh 高度。Session metadata、Connection、Logs 自然排列在终端下方，滚动即可查看。

页面上**不能出现**悬浮的 sidebar toggle 按钮（☰ 图标），也**不能出现**半���明遮罩层。

Metadata grid 更紧凑（字号 12px，间距更小）。Log box 高度限制为 160px。

---

## 7. 终端功能验证

在 Terminal 页面测试以下交互：

- 如果是 tmux-backed 会话（通过 `agentoffice claude` 启动），终端应显示 Claude Code 界面，内容实时渲染
- 终端可交互：通过 MCP `type_text` 或 `press_key` 输入文字后终端应有响应
- 如果是 hook-only 会话（没有 tmux），终端应显示 `[terminal unavailable]` 提示
- 点击 "← Office" 返回按钮，页面应回到 Office 主页

---

## 8. Quick Launch 功能验证

**MCP 操作步骤：**
```
navigate_page → url: http://127.0.0.1:8765/#/
take_snapshot                              // 找到 Launch Claude 按钮 uid
click → uid: {launch_claude_button_uid}
wait_for → text: ["Claude Session"]        // 等待新 worker 出现
take_screenshot
```

点击 Launch Claude 按钮后，按钮应短暂变为 disabled。几秒后 Office 中某个 zone 应出现新的 "Claude Session" worker 卡片。点击该卡片应能进入 Terminal 页面并看到 Claude Code 终端。

---

## 9. 设计一致性验证

通过 MCP 脚本校验设计 tokens 是否正确应用：

```
evaluate_script → () => {
  const body = getComputedStyle(document.body);
  const panel = document.querySelector('.panel');
  const panelStyle = panel ? getComputedStyle(panel) : {};
  const h1 = document.querySelector('h1');
  const h1Style = h1 ? getComputedStyle(h1) : {};
  return {
    bodyFont: body.fontFamily,
    bodyBg: body.backgroundColor,
    panelBg: panelStyle.backgroundColor,
    panelBorder: panelStyle.border,
    panelRadius: panelStyle.borderRadius,
    titleFont: h1Style.fontFamily
  };
}
```

期望结果：
| 属性 | 期望值 |
|------|--------|
| bodyFont | 包含 `DM Sans` |
| bodyBg | 接近 `rgb(244, 235, 224)` 即 `#f4ebe0` |
| panelBg | 接近 `rgb(255, 251, 245)` 即 `#fffbf5` |
| panelBorder | 包含 `1px`（不是 `3px`） |
| panelRadius | `20px` |
| titleFont | 包含 `DM Serif Display` |

---

## 10. 不应变化的功能

以下功能不在本次 UI 修改范围内，但需确认未被破坏：

- WebSocket 实时连接正常（status pill 显示 "online"，非持续 "reconnecting"）
- Worker 状态实时更新（启动新 worker 后自动出现在对应 zone）
- 终端 WebSocket 数据传输正常（终端可读写）
- Hash 路由正常切换（`#/` ↔ `#/terminal/{id}`）
- API 调用正常（session launch / session list）
- Login (`/login.html`) 和 Dashboard (`/dashboard.html`) 页面外观不受影响（它们使用独立的 `login.css`）

---

## 11. 响应式断点参考

| 视口宽度 | Office 布局 | Terminal 布局 |
|----------|--------------|--------------|
| >1080px | 两列（Office Floor + Quick Launch 并排） | 左右（终端 + sidebar 并排） |
| 768–1080px | 单列（面板上下堆叠） | 上下（终端 + sidebar 流式排列） |
| <768px | 单列紧凑，zone 2×2，legend 隐藏，描述隐藏 | 上下紧凑，sidebar 内联，无浮层 |

---

## 12. 清理

测试完成后执行：

```bash
# 停止服务
kill $(lsof -ti :8765)

# 清理 agentoffice 的 tmux sessions
tmux list-sessions 2>/dev/null | grep agentoffice | cut -d: -f1 | xargs -I{} tmux kill-session -t {}
```
