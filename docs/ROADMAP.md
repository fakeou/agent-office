# AgentOffice Roadmap

## Phase 1 — 局域网单机监控

> 目标：在本地局域网内完成从启动到终端控制的完整闭环。

- [x] 局域网内通过 Web 端远程查看并控制终端会话
- [x] 支持 Claude / Codex 通过 `agentoffice claude` / `agentoffice codex` 启动并自动注册 Worker
- [x] 前端 Office 四状态机（`idle` → `working` → `approval` → `attention`）正常流转与 UI 联动
- [x] 支持网页创建claude/codex 终端

## Phase 2 — 公网远程访问

> 目标：突破局域网限制，从任意网络环境管理本地 Agent。通过 Relay 托管模式建立隧道，AgentOffice 负责应用层认证、WebSocket 断线重连和隧道管理。

### Token 认证系统（本地模式）

- [x] `src/auth.js` 认证模块（token 生成、时序安全比较、LAN 判断、限速）
- [x] 启动时检查 `~/.agentoffice/token`，不存在则生成 64 位 hex 随机 token
- [x] `agentoffice token reset` 命令：重新生成 token
- [x] `agentoffice token show` 命令：查看当前 token
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
- [x] 样式与 AgentOffice 现有风格一致

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

## Phase 3 — 像素风游戏化 Office

> 目标：将 Office 从仪表盘升级为像素风动画场景，同时保留现有 Web / App 终端体验与本地 daemon 架构。

### 架构方向

- [ ] 采用混合架构：业务壳继续使用前端技术承载，Office 主视图升级为嵌入式 canvas 世界
- [ ] 优先选择 `PixiJS` 作为世界渲染层，保留现有 DOM / 路由 / `xterm.js` 终端页
- [ ] 后端继续只输出 Worker 业务状态（`idle` / `working` / `approval` / `attention`）与 session 元数据
- [ ] 前端世界层自行负责状态到目标区域、目标家具、动画循环和简单寻路的映射
- [ ] 点击 Worker 角色时保持现有行为不变，仍然跳转到对应 `#/terminal/:sessionId`
- [ ] Office 世界作为常驻运行时，只在页面切换时暂停或隐藏，不重复销毁和初始化资源

### 世界与玩法表达

- [ ] 视角决策：Phase 3 第一版采用正俯视视角，优先突出四个工作区的清晰分区、状态可读性和点击准确性
- [ ] 将现有四状态映射为四个像素分区：`Office Floor`、`Approval Desk`、`Attention Desk`、`Idle`
- [ ] 每个分区定义少量可复用锚点（anchor points）和家具交互点（interaction points）
- [ ] Worker 收到新状态后，前端仅为其选择目标锚点并完成简单移动，不追求复杂过渡动画
- [ ] Worker 到达目标点后直接切换到对应状态表现，优先保证一眼可读而不是动作丰富度
- [ ] 状态表现以少量固定符号为主：`Help` 牌子、红色感叹号气泡、桌面敲电脑、坐姿/睡觉
- [ ] 第一版不追求大量家具和动作变体，先用少量固定建筑和站位完成可用闭环
- [ ] 为每个 Worker 提供简短显示名，并让名字作为角色实体的一部分随人物一起移动
- [ ] 3/4 斜俯视视角暂不作为第一版目标，仅在基础分区验证完成后再评估是否作为后续视觉升级方向

### 前端实现步骤

- [ ] 新建世界层模块，例如 `world/` 或独立场景管理器，负责 Pixi app、资源缓存、entity 更新和点击命中
- [ ] 用 canvas 世界替换当前 Office 卡片视图，但保留顶栏、按钮、连接状态、筛选和其他 DOM UI
- [ ] 建立 `session -> worker entity` 同步层，将后端 session 数据映射为前端角色实体
- [ ] 每个 `worker entity` 保留稳定的 `sessionId`，作为点击后跳转终端的唯一标识
- [ ] 名字标签作为 `worker entity` 的子节点渲染在头顶，而不是使用独立 DOM 浮层
- [ ] 建立前端表现态机：`walking`、`idle`、`working`、`approval`、`attention`
- [ ] 为四个分区定义固定家具布局、占位规则和可行走网格
- [ ] 实现简单可用的网格寻路（A* 即可），支持状态切换时取消旧路径并重算
- [ ] 加入轻量的停留时间和占位机制，避免状态抖动导致角色来回跑动或抢占同一家具
- [ ] 在页面失焦、切换 tab 或进入 terminal 页面时暂停 ticker 或降频；返回 Office 时恢复，不重新加载贴图
- [ ] 点击 Worker 时仅复用现有前端路由跳转到 `#/terminal/:sessionId`，不在 canvas 世界内重写终端逻辑
- [ ] 为 Worker 点击增加最小交互反馈，例如 hover 高亮、名称浮层和误触保护

### App 封装

- [ ] 首选桌面壳继续沿用前端技术路线，优先评估 `Electron`
- [ ] App 内保留现有 Web 技术承载的登录、设置、终端和会话管理
- [ ] Office 世界作为 App 中的嵌入式 canvas 视图，而不是单独的游戏运行时

### 资产获取与生产方案

- [ ] 技术决策：Phase 3 首选使用 `PixelLab` 进行角色与动作资产生产，原因是它支持文生角色，并可基于已有角色继续生成动作
- [ ] 资产主策略优先采用“`PixelLab` 文生角色 -> 基于角色生成动作 -> 导出 spritesheet”的轻量流程
- [ ] 第一版先围绕单个统一 Worker 角色建立最小资产集，再视一致性结果决定是否扩展更多外观变体
- [ ] 在 `PixelLab` 中优先验证最小动作集：`walk`、`idle`、`working`、`approval`、`attention`
- [ ] 若 `PixelLab` 在动作一致性、导出控制或角色复用上不足，再回退到“3D 基底 + 动画重定向 + 像素化导出”备选流水线
- [ ] 3D 备选方案中，角色基底优先寻找低多边形、Humanoid、T-pose/A-pose、轮廓清晰的 3D 绑骨资产
- [ ] 3D 备选方案中，动画优先使用 `Mixamo` 获取最小动作集：`walk`、`idle`、`working`、`approval`、`attention`
- [ ] 3D 备选方案中，必要时补充可商用低多边形角色资源包，统一比例、头身比和配色后再转像素
- [ ] 3D 备选方案中，使用 `Blender` 或 `Godot Pixel Renderer` 固定视角批量导出像素序列帧
- [ ] 使用 `Pixelorama` 做最终调色、修边、spritesheet 拼表和导出
- [ ] 第一批资产控制在最小可用集：1 到 2 套基础 worker、5 个核心状态动画、1 套基础家具 atlas
- [ ] 角色差异优先通过发型、工牌、衣服配色、provider 配色和桌面道具实现，而不是一开始制作大量不同角色
- [ ] 若 `PixelLab` 的一致性和导出结果满足要求，则优先走“单角色 -> 多状态动作 -> spritesheet 导出”的轻量方案，暂缓 3D 资产流水线

### 第一批资产清单

- [ ] `walk`：通用移动状态，只用于在分区之间走到目标位置
- [ ] `idle`：走到 Idle 区后直接切换为坐着发呆、休息或睡觉的静态/轻循环表现
- [ ] `working`：走到工位建筑后直接嵌入工位内，表现为坐着或站着敲电脑
- [ ] `approval`：人物站在地面上，举一个写着 `Help` 的牌子，不要求复杂循环动作
- [ ] `attention`：人物站在地面上，头顶出现红色感叹号气泡，保持高可读性
- [ ] 基础建筑：工作工位、审批点、注意力处理点、Idle 休息点
- [ ] 基础特效：`Help` 牌子、红色感叹号气泡、屏幕闪烁或敲电脑的小幅循环
- [ ] 区域装饰：地板分区、简单隔断、少量标识牌，保证四个区域在视觉上一眼可区分
- [ ] 角色标识：头顶简短名字标签，默认常驻显示，必要时可为 `Help` 牌子或感叹号气泡让位

### 验证里程碑

- [ ] M1：单个 Worker 能在四个区域之间切换状态并完成寻路和动画播放
- [ ] M2：多个 Worker 同时运行时，能稳定占位、移动和点击进入终端
- [ ] M3：Office 视图在网页与桌面 App 中均可稳定运行，切换标签页或页面后无需重复加载世界资源
- [ ] M4：完成第一版开罗风格像素工坊视觉基线，并具备可持续扩展的资产流水线

## Phase 4 — 多人协作与社交互动

> 目标：从单人工具进化为多人社区，成为真正的 Agent Office。依赖 Relay 的用户体系和状态缓存实现跨用户交互。

**个人工作室**
- [ ] 每位用户拥有独立的工作室视图，展示名下所有 Worker 的实时状态
- [ ] 点击 Worker 角色可跳转至对应终端，保持完整的远程控制能力

**社交与互动**
- [ ] 支持访问他人工作室，查看其 Worker 运行状态
- [ ] 加入访客互动动画（围观、点赞、留言气泡等前端表现）
- [ ] 建立简易好友系统，支持关注、访问记录等基础社交功能
- [ ] 此阶段 AgentOffice 正式成为一个有社区属性的 Agent 协作平台
