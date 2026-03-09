# AgentTown Roadmap

## Phase 1 — 局域网单机监控

> 目标：在本地局域网内完成从启动到终端控制的完整闭环。

- [x] 局域网内通过 Web 端远程查看并控制终端会话
- [x] 支持 Claude / Codex 通过 `agenttown claude` / `agenttown codex` 启动并自动注册 Worker
- [x] 前端 Workshop 四状态机（`idle` → `working` → `approval` → `attention`）正常流转与 UI 联动
- [x] 支持网页创建claude/codex 终端

## Phase 2 — 公网远程访问

> 目标：突破局域网限制，从任意网络环境管理本地 Agent。通过 Relay 托管模式建立隧道，AgentTown 负责应用层认证、WebSocket 断线重连和隧道管理。

### Token 认证系统（本地模式）

- [x] `src/auth.js` 认证模块（token 生成、时序安全比较、LAN 判断、限速）
- [x] 启动时检查 `~/.agenttown/token`，不存在则生成 64 位 hex 随机 token
- [x] `agenttown token reset` 命令：重新生成 token
- [x] `agenttown token show` 命令：查看当前 token
- [x] 启动时打印 token、文件路径和认证模式

### HTTP 认证中间件

- [x] `POST /api/auth/login`：验证 token，设置 HttpOnly cookie（7 天有效）
- [x] `POST /api/auth/logout`：清除 cookie
- [x] `GET /api/auth/check`：返回认证状态
- [x] 认证中间件：LAN 请求免认证（兼容 Phase 1）；非 LAN 或 `--auth` 强制认证
- [x] 登录限速：同 IP 每分钟最多 5 次，连续失败 10 次锁定 15 分钟

### WebSocket 认证

- [x] `/ws/events` 和 `/ws/terminal/:sessionId` upgrade 请求检查 cookie token
- [x] LAN 请求免认证规则同 HTTP
- [x] 未认证 → 拒绝 upgrade，返回 401

### 登录页面

- [x] `static/login.html` + `static/login.css`：token 输入 + 登录按钮
- [x] 成功后跳转主页，失败显示错误和剩余尝试次数
- [x] 样式与 AgentTown 现有风格一致

### 前端认证感知

- [x] 所有 fetch 请求处理 401 → 跳转登录页
- [x] WebSocket 连接失败检查认证问题

### WebSocket 断线重连

- [x] Events WebSocket 断线自动重连，指数退避（1s → 2s → 4s → ... → 30s 上限）
- [x] 重连成功后重新拉取 `/api/sessions` 同步全量状态
- [x] UI 连接状态指示器（online / reconnecting... / connecting...）
- [x] Terminal WebSocket 断线自动重连，指数退避
- [x] 终端显示 "connection lost, reconnecting..." 提示

### CLI 参数

- [x] `--auth` 标志：强制所有请求认证（包括 LAN）
- [x] `--auth-token <token>`：指定自定义 token
- [x] 启动日志打印当前认证模式

### 文档

- [x] `ROADMAP.md`：Phase 2 细化 checklist
- [x] `PROJECT_NOTES.md`：Phase 2 架构描述
- [x] `README.md`：公网访问章节

### Relay 托管模式

- [x] `packages/cli/src/tunnel.js`：Relay 隧道客户端（WebSocket 连接、HTTP/WS 代理、心跳、断线重连）
- [x] `packages/relay/`：Relay 服务端（隧道代理、状态缓存）
- [x] `packages/api/`：Dashboard API（用户注册、API Key 管理）
- [x] `--key sk_xxx --relay URL` CLI 参数启动托管模式
- [x] 隧道建立后自动推送 session 状态摘要到 Relay 缓存
- [x] ~~FRP 模式~~ 已废弃，统一到 Relay 托管模式

## Phase 3 — 像素风游戏化 Workshop

> 目标：将 Workshop 从仪表盘升级为像素风动画场景，赋予 Worker 视觉生命力。

- [ ] 设计像素风游戏地图，包含四个区域场景分别对应四种 Worker 状态
- [ ] 为 Worker 角色设计专属 Sprite 动画（行走、工作、等待审批、需要关注）
- [ ] Worker 状态切换时播放场景迁移动画，角色在不同区域间移动
- [ ] 整体视觉风格参考 Cairo（开罗游戏），营造轻松的像素工坊氛围

## Phase 4 — 多人协作与社交互动

> 目标：从单人工具进化为多人社区，成为真正的 Agent Town。依赖 Relay 的用户体系和状态缓存实现跨用户交互。

**个人工作室**
- [ ] 每位用户拥有独立的工作室视图，展示名下所有 Worker 的实时状态
- [ ] 点击 Worker 角色可跳转至对应终端，保持完整的远程控制能力

**社交与互动**
- [ ] 支持访问他人工作室，查看其 Worker 运行状态
- [ ] 加入访客互动动画（围观、点赞、留言气泡等前端表现）
- [ ] 建立简易好友系统，支持关注、访问记录等基础社交功能
- [ ] 此阶段 AgentTown 正式成为一个有社区属性的 Agent 协作平台
