# AgentOffice Phase 3 — PixelLab 资产提示词手册

> 所有资产基于 **Warm Atelier 暖工坊** 风格基调生成，保持与现有 Web UI 配色（暖棕米色系）的视觉一致性。
> PixelLab 提示词均为英文，可直接粘贴使用。

---

## 全局风格基调

以下描述词在所有提示词中共用，生成时需要附加：

- **视角**：`high top-down view`（PixelLab 实际生成 worker-00 时使用的视角，约 60°+ 俯视，角色正脸可见，为所有资源统一基准）
- **像素规格**：角色 48×48（PixelLab 默认导出尺寸），背景图按区域尺寸，家具 32×32～64×64
- **轮廓风格**：1px dark brown-black pixel outline（不使用纯黑，用深棕 `#2f2b26`）
- **整体色调**：warm muted earth tones, slightly desaturated, no neon colors
- **参考风格**：Kairosoft pixel art, cozy RPG, warm atelier workshop

**区域主色（与 Web UI 对应）：**

| 区域 | Web CSS 变量 | 像素主色描述 |
|------|-------------|-------------|
| Working | `#e0d8f0` | soft lavender-purple floor, blue monitor glow |
| Approval | `#f5dcc0` | warm peach-amber floor, golden waiting light |
| Attention | `#f0c4c0` | dusty rose-salmon floor, burnt orange warning |
| Idle | `#e8e0d0` | warm cream-beige floor, soft lamp yellow |
| 中央道路 | `#d6c9b6` | weathered stone gray-tan cobblestone |

---

---

# 一、场景（Scene）

---

## Idle 区（左上角）

> 风格：温暖奶油米色，休息氛围，昏黄台灯光，慵懒舒适

### Idle 区地板场景

```
high top-down view pixel art empty room background, cozy rest lounge architecture only, warm cream-beige floor planks with subtle wood grain texture, gentle variation in plank tone, warm cream off-white plaster walls on three sides, simple clean wall surfaces with no trim decorations, one plain rectangular window centered on the upper wall with a muted cream-painted wooden frame, outside the window a soft quiet sky with pale blue tone and distant blurred green treetops, no furniture, no lamps, no props, no rugs, no wall decor, no shelves, no curtains, no characters, warm muted palette matching #e8e0d0, dark brown pixel outline on tile edges, Kairosoft cozy style
```

### 沙发

```
high top-down view pixel art furniture, two-seat sofa facing south, backrest along north edge visible as a thick rounded top bar, seat cushion below with crease lines, warm dusty rose fabric upholstery, tiny throw pillow in warm ochre on one side, armrests on left and right ends, slight dark shadow cast below, 48x32 sprite, warm muted pink-rose palette, dark brown 1px outline, transparent background, cozy RPG furniture asset
```

### 懒人豆袋椅

```
high top-down view pixel art furniture, oversized beanbag chair, symmetric oval from above, soft dusty lavender-beige rounded blob shape, subtle fabric crease lines radiating from center toward edges, small indent in top center where person would sit, slight drop shadow, 28x28 sprite, warm muted mauve-beige palette, dark brown 1px outline, transparent background, cozy RPG game asset
```

### 榻榻米睡垫

```
high top-down view pixel art furniture, Japanese-style floor sleeping mat oriented east-west, pillow at north end, foot area toward south, light warm straw-tan woven texture with visible weave grid pattern, dark olive-green border stripe around edge, small rectangular cotton pillow in warm cream at top end, 48x32 sprite, warm straw-tan and olive palette, dark brown 1px outline, transparent background, cozy RPG room asset
```

### 台灯（桌面/落地）

```
high top-down view pixel art furniture, small floor lamp, symmetric glow radiating outward in all directions, circular warm yellow glowing base on floor, soft yellow-orange light radius fading outward on surrounding floor tiles, lamp post too small to see from above but glow patch clearly visible, 20x20 sprite with glow, warm amber-yellow palette, dark brown outline on base, transparent background
```

### 墙壁（三面，开口朝向中央道路）

> Idle 区围住左、上、右三面，下方开口连接公共道路。墙色与地板同为暖奶油米色系。

**水平墙段（上墙 / 下墙，可横向拼接）**

```
high top-down view pixel art wall segment, horizontal interior room wall, warm cream off-white painted plaster surface with faint subtle texture, visible wall top face as a thick flat strip, slight darker shadow cast on floor side suggesting wall depth, 64x10 sprite, tileable horizontally, warm cream palette matching #e8e0d0 with dark brown shadow edge, dark brown 1px outline, transparent background outside wall surface
```

**垂直墙段（左墙 / 右墙，可纵向拼接）**

```
high top-down view pixel art wall segment, vertical interior room wall, same warm cream off-white painted surface as horizontal variant, thick flat strip oriented vertically, slight shadow on interior floor side, 10x64 sprite, tileable vertically, warm cream palette matching #e8e0d0, dark brown 1px outline, transparent background outside wall surface
```

**转角块（L 形直角，旋转复用覆盖三个实角）**

```
high top-down view pixel art wall corner piece, L-shaped wall junction, fills a square corner where horizontal and vertical wall segments meet, same warm cream off-white surface texture, clean tight corner join with no gap, 10x10 sprite, warm cream palette matching #e8e0d0, dark brown 1px outline, transparent background outside wall area
```

---

## Working 区（右上角）

> 风格：淡薰衣草紫，生产感，显示器冷蓝光，整洁办公

### Working 区地板场景

```
high top-down view pixel art empty room background, productive office architecture only, square woven patchwork carpet floor made of neat modular carpet tiles, subtle checkerboard variation between soft warm gray, off-white, and very light beige squares, lightly textured woven surface with clean seams between squares, crisp white painted walls on three sides, smooth clean wall surfaces with no signage or trim decoration, large floor-to-ceiling windows spanning most of the upper wall with slim white frames, outside the windows bright daytime sky and a few clean modern buildings visible in the distance in soft desaturated blue-gray tones, no furniture, no computers, no cables, no paper, no props, no lamps, no wall decor, no curtains, no characters, restrained neutral palette with clean office atmosphere, dark brown pixel outline, clean modern office style
```

### 电脑办公桌

```
high top-down view pixel art furniture, L-shaped or rectangular office desk against north wall facing south, monitor screens at north end with screen glow facing south toward viewer, keyboard rectangle in light gray below monitors at south side, light birch wood laminate surface color warm beige-white, small white coffee mug with steam curl, tiny notebook in warm cream, thin dark cables trailing off desk edge, 56x32 sprite, warm desk surface with cool blue monitor accent, dark brown 1px outline, transparent background, RPG office furniture
```

### 显示器（单独道具）

```
high top-down view pixel art prop, flat-screen computer monitor facing south with screen face angled toward south viewer, vibrant blue-white gradient screen glow, thin dark bezel border, screen reflection highlight in top-left corner, subtle blue light cast on desk surface below, 20x14 sprite, blue-white-cyan screen palette, dark border, transparent background, pixel art game prop
```

### 办公椅

```
high top-down view pixel art furniture, office swivel chair facing south, seat cushion visible from above, backrest at north edge as a thin dark curved bar, visible 5-point star wheel base in dark gray below seat, slight worn texture on seat, small dark shadow underneath, 24x24 sprite, dark charcoal and cool gray palette, dark brown 1px outline, transparent background, RPG office furniture asset
```

### 书架（靠墙）

```
high top-down view pixel art furniture, wall bookshelf segment against north wall facing south, book spines visible facing south as small colorful rectangles in warm red ochre amber blue, dark walnut wood top surface edge visible at north, slight book stack variation in height, 48x12 sprite, warm dark wood with colorful book accent palette, dark brown 1px outline, transparent background, RPG room furniture asset
```

### 墙壁（三面，开口朝向中央道路）

> Working 区围住上、右、下三面，左方开口连接公共道路。墙色与地板同为淡薰衣草紫系。

**水平墙段（上墙 / 下墙，可横向拼接）**

```
high top-down view pixel art wall segment, horizontal interior room wall, soft lavender-white painted smooth surface, clean modern office wall aesthetic, thick flat strip showing wall top face, subtle cooler shadow on floor side, 64x10 sprite, tileable horizontally, soft lavender palette matching #e0d8f0 with slightly deeper purple-gray shadow edge, dark brown 1px outline, transparent background outside wall surface
```

**垂直墙段（左墙 / 右墙，可纵向拼接）**

```
high top-down view pixel art wall segment, vertical interior room wall, same soft lavender-white painted surface as horizontal variant, thick flat strip oriented vertically, clean modern feel, 10x64 sprite, tileable vertically, soft lavender palette matching #e0d8f0, dark brown 1px outline, transparent background outside wall surface
```

**转角块（L 形直角，旋转复用覆盖三个实角）**

```
high top-down view pixel art wall corner piece, L-shaped wall junction, square corner block where horizontal and vertical lavender wall segments meet, same soft lavender-white surface, clean crisp corner join, 10x10 sprite, soft lavender palette matching #e0d8f0, dark brown 1px outline, transparent background outside wall area
```

---

## Attention 区（左下角）

> 风格：粉尘玫瑰红调，紧迫但不刺眼，烧橙色警示，有压迫感但不失温暖

### Attention 区地板场景

```
high top-down view pixel art empty room background, urgent attention area architecture only, warm dusty rose-salmon floor tiles with slightly irregular stone pattern, burnt orange diagonal hazard stripe painted along floor edge border, small worn scuff marks suggesting heavy foot traffic, slightly darker ambient tone than other rooms, dusty rose-salmon painted walls on three sides with a subtle burnt orange edge line near the wall base, one narrow rectangular window on the upper wall with a dark warm-brown frame, outside the window an overcast pale gray-orange sky with distant indistinct building shapes, no furniture, no counters, no signs, no props, no lamps, no wall decor, no curtains, no characters, warm rose-salmon palette matching #f0c4c0 with burnt orange accent #b95c33, dark brown pixel outline, slightly urgent atmosphere
```

### 警示地面标记

```
high top-down view pixel art floor decal, warning zone floor marking, burnt orange and warm dark brown diagonal stripe pattern rectangle, slightly worn paint edges with small chips, 32x16 sprite, bold orange #b95c33 and dark brown palette, dark 1px outline, transparent background, RPG hazard floor tile asset
```

### 告示展板（立式）

```
high top-down view pixel art furniture, freestanding bulletin board or sign stand facing south, sign face toward south viewer, visible only as narrow vertical rectangle showing board top edge and wooden easel legs, cork board face in warm tan with burnt orange border frame, small paper notes suggestion, 16x32 sprite, warm tan and burnt orange palette, dark brown 1px outline, transparent background, RPG room prop
```

### 小型办公桌（处理台）

```
high top-down view pixel art furniture, small single-person work counter facing south, surface visible from above, warm terracotta-toned surface, single small monitor at north end showing amber-orange screen facing south, clipboard or document sheet in warm cream on surface, no chair, 40x24 sprite, warm terracotta and orange palette, dark brown 1px outline, transparent background, RPG office counter prop
```

### 墙壁（三面，开口朝向中央道路）

> Attention 区围住左、下、右三面，上方开口连接公共道路。墙色与地板同为粉尘玫瑰红系，加入烧橙色压边增强紧迫感。

**水平墙段（上墙 / 下墙，可横向拼接）**

```
high top-down view pixel art wall segment, horizontal interior room wall, warm dusty rose-salmon painted surface with slight rough plaster texture, thick flat strip showing wall top face, burnt orange accent stripe along outer edge suggesting urgency trim, shadow on floor side slightly deeper than other zones, 64x10 sprite, tileable horizontally, dusty rose palette matching #f0c4c0 with burnt orange #b95c33 trim edge, dark brown 1px outline, transparent background outside wall surface
```

**垂直墙段（左墙 / 右墙，可纵向拼接）**

```
high top-down view pixel art wall segment, vertical interior room wall, same warm dusty rose-salmon surface with burnt orange accent trim as horizontal variant, thick flat strip oriented vertically, 10x64 sprite, tileable vertically, dusty rose palette matching #f0c4c0 with burnt orange trim, dark brown 1px outline, transparent background outside wall surface
```

**转角块（L 形直角，旋转复用覆盖三个实角）**

```
high top-down view pixel art wall corner piece, L-shaped wall junction, square corner block matching dusty rose wall segments, burnt orange accent trim continues around corner, 10x10 sprite, dusty rose palette matching #f0c4c0 with burnt orange #b95c33 edge, dark brown 1px outline, transparent background outside wall area
```

---

## Approval 区（右下角）

> 风格：温暖桃杏黄，正式等候，金黄色光感，职业稳重

### Approval 区地板场景

```
high top-down view pixel art empty room background, formal approval area architecture only, warm peach-amber stone tile pattern with slight matte texture, subtle orderly tile alignment, a few understated golden ochre painted floor markings integrated into the surface, neat and calm atmosphere, soft warm diffuse lighting, warm peach-amber walls on three sides with clean smooth finish and a restrained golden ochre trim line, one tall rectangular window centered on the upper wall with a honey-cream frame, outside the window a calm pale golden sky and distant soft green hills, no furniture, no chairs, no counters, no signs, no props, no lamps, no wall decor, no curtains, no characters, warm peach-amber palette matching #f5dcc0, dark brown pixel outline, professional calm style
```

### Help 展板（大型固定版）

```
high top-down view pixel art prop, large vertical standing display sign facing south toward viewer, sign face visible at south, white painted wooden board with thick burnt orange border frame, bold pixel text "HELP" centered in warm dark brown, clean simple design, slight wooden post base visible, 24x36 sprite, white and burnt orange #b95c33 palette, dark brown 1px outline, transparent background, RPG room sign prop
```

### 等候椅（排椅）

```
high top-down view pixel art furniture, two connected waiting room chairs facing south, seat pads visible from above, warm golden-amber or peach upholstered seat pads, thin dark metal frame connecting them visible at north edge as backrest bar, slight shadow underneath, 48x20 sprite, warm peach-amber and dark gray metal palette, dark brown 1px outline, transparent background, RPG waiting room furniture
```

### 受理小台（接待柜台边缘）

```
high top-down view pixel art furniture, small reception counter half-wall facing south, counter top surface visible from above in warm honey-wood laminate, south-facing serving side visible as thin front panel, small bell or button on top surface, thin dark wooden panel sides, 48x12 sprite, warm honey-amber wood palette with dark brown outline, transparent background, RPG counter prop
```

### 地面等候标记（脚印）

```
high top-down view pixel art floor decal, waiting queue footprint markers, two small shoe sole shapes in warm golden ochre painted on floor, simple and readable, pointing forward in queue direction, 16x20 sprite, warm ochre palette, dark 1px outline, transparent background, RPG floor marking asset
```

### 墙壁（三面，开口朝向中央道路）

> Approval 区围住上、右、下三面，左方开口连接公共道路。墙色与地板同为温暖桃杏黄系，金黄色压边体现正式稳重感。

**水平墙段（上墙 / 下墙，可横向拼接）**

```
high top-down view pixel art wall segment, horizontal interior room wall, warm peach-amber smooth painted surface, clean formal waiting room aesthetic, thick flat strip showing wall top face, warm golden ochre accent trim along outer edge, gentle shadow on interior floor side, 64x10 sprite, tileable horizontally, warm peach palette matching #f5dcc0 with golden ochre trim edge, dark brown 1px outline, transparent background outside wall surface
```

**垂直墙段（左墙 / 右墙，可纵向拼接）**

```
high top-down view pixel art wall segment, vertical interior room wall, same warm peach-amber smooth surface with golden ochre trim as horizontal variant, thick flat strip oriented vertically, formal and calm atmosphere, 10x64 sprite, tileable vertically, warm peach palette matching #f5dcc0 with golden trim, dark brown 1px outline, transparent background outside wall surface
```

**转角块（L 形直角，旋转复用覆盖三个实角）**

```
high top-down view pixel art wall corner piece, L-shaped wall junction, square corner block matching warm peach wall segments, golden ochre trim continues neatly around corner, 10x10 sprite, warm peach palette matching #f5dcc0 with golden ochre edge, dark brown 1px outline, transparent background outside wall area
```

---

## 中央道路 / 广场（交通枢纽）

> 风格：风化石板灰棕，中性通行感，轻苔藓点缀，区分于四个功能区

### 中央广场地砖

```
high top-down view pixel art, central public plaza cobblestone road, weathered irregular stone tiles in warm gray-tan with subtle mortar line gaps, faint moss or lichen green in a few cracks, slight color variation between stones for texture, neutral warm gray-brown palette #d6c9b6 range, dark brown pixel outline on each stone edge, wide enough for character transit between 4 zones, old town plaza feel
```

### 道路（直线段）

```
high top-down view pixel art, stone paved road segment, warm medium-gray stone block pattern, 2-3 blocks wide walking lane, thin worn center line in slightly lighter gray from foot traffic, neutral warm gray palette, dark brown pixel outline, connects plaza hub to zone entry points
```

### 道路交叉路口

```
high top-down view pixel art, four-way road intersection hub tile, warm stone plaza center piece, slightly larger decorative stone pattern in center suggesting a focal point or small round paving medallion in lighter warm cream stone, 32x32 or 48x48 center tile, warm gray-tan palette, dark brown pixel outline, central anchor point for all four direction paths
```

### 区域入口门廊/边界

```
high top-down view pixel art, zone entry arch or threshold marking, two small pillar stumps or gate posts visible from above as small squares flanking path entrance, warm stone pillar tops in cream-tan, subtle darker shadow at zone boundary edge, 16x16 per pillar, warm cream-stone palette with dark brown outline, decorative zone transition marker
```

---

---

# 二、角色（Character）

> 所有角色使用 PixelLab **Animate with Text** 工具生成，视角统一为 `high top-down view`，尺寸 48×48。

---

## worker-00（默认角色）

> 程序员形象，是 AgentOffice 世界里所有 AI worker 的默认外观。

### 基础立绘 / 角色参考图

```
high top-down view pixel art character, young adult male programmer, wearing a green and white plaid flannel shirt with visible collar and chest pocket, dark indigo blue jeans, white sneakers, thick voluminous dark brown hair slightly messy and full on top, small rectangular white ID badge clipped to shirt chest, warm neutral skin tone, round friendly face with minimal pixel expression, chunky 3-head-tall proportions, facing south toward viewer, 48x48 sprite, dark brown 1px outline, transparent background, warm muted color palette, Kairosoft cozy RPG style
```

---

---

# 三、角色动画（Animations）

> 所有动画基于 **worker-00 基础立绘** 生成（PixelLab Animate with Text 工具）。
> 视角：`high top-down view`，尺寸：48×48 每帧，透明背景。

---

## walk（行走）

> 用途：在区域之间移动时播放，穿越中央道路时使用

### walk 动画（4 方向，各 6 帧）

```
high top-down view pixel art character walk cycle, young adult male programmer in green and white plaid flannel shirt and dark indigo jeans, thick messy dark brown hair bouncing slightly, arms swing naturally alternating with stride, legs show clear step movement, smooth 6-frame seamless loop, 48x48 per frame, dark brown outline, transparent background, warm muted palette
```

---

## idle（发呆 / 休息）

> 用途：到达 Idle 区锚点后切换，坐着休息的轻循环

### idle 坐姿发呆

```
high top-down view pixel art character idle animation, young adult male programmer sitting down resting, green and white plaid shirt visible from above, thick messy dark brown hair seen from slight overhead angle, relaxed slouched posture with arms resting, subtle 2-frame breathing loop with very slight chest rise, 48x48 sprite, warm muted palette, dark brown outline, transparent background, cozy resting state
```

### idle 打盹（头顶 ZZZ 变体）

```
high top-down view pixel art character sleeping idle, programmer sitting slouched with head tilted to one side, green plaid shirt, thick dark hair disheveled from dozing, small floating ZZZ bubble in soft lavender-gray drifting upward above head, 2-4 frame subtle loop, 48x48 character area, warm muted palette, dark brown outline, transparent background
```

---

## working（工作中）

> 用途：到达 Working 区工位锚点后切换，坐在电脑前敲键盘

### working 敲键盘循环

```
high top-down view pixel art character working animation, young adult male programmer sitting at desk, green and white plaid flannel shirt, thick dark brown hair leaning slightly toward screen, arms extended forward toward keyboard, subtle 4-frame typing loop where hand pixel positions alternate slightly, faint blue monitor glow reflecting on shirt and hair from screen above, 48x48 sprite, dark brown outline, transparent background, focused productive posture
```

---

## approval（举牌等待）

> 用途：到达 Approval 区锚点后切换，举着 Help 牌子站立

### approval 举牌站立

```
high top-down view pixel art character approval pose, young adult male programmer standing upright facing south, green and white plaid flannel shirt, thick messy dark brown hair, both arms raised holding a rectangular white wooden sign reading "Help" in dark warm-brown bold pixel letters, thin burnt orange border on sign edge, white ID badge visible on chest below raised arms, slightly pleading forward-leaning posture, 2-frame subtle sway loop, 48x48 character sprite, dark brown outline, transparent background, warm muted palette
```

---

## attention（警报状态）

> 用途：到达 Attention 区锚点后切换，头顶红色感叹号

### attention 感叹号警报

```
high top-down view pixel art character attention pose, young adult male programmer standing upright facing south, green and white plaid flannel shirt, thick messy dark brown hair, tense alert body posture with arms slightly raised or hands gesturing in distress, bright red circular speech bubble with bold white "!" floating above thick hair, bubble has thick red border ring, high contrast and readable at small size, 2-frame pulse loop where bubble scales slightly, 48x48 character area plus overhead bubble, dark brown outline, transparent background, warm muted character palette with high-contrast red bubble
```

---

---

# 四、道具与特效（Props & Effects）

---

## Help 牌子（手持道具）

> 角色 approval 状态时手持，也可作为独立世界道具

### Help 牌子 — 手持版

```
high top-down view pixel art prop, hand-held rectangular wooden sign, white painted rough-plank board surface, bold pixel text "Help" in warm dark-brown letters centered on white face, thin burnt orange #b95c33 painted border stripe around edge, short thick wooden handle stick at bottom, slight paint scratch texture on board, sign face at slight forward angle, 16x22 sprite, white and burnt orange and wood-brown palette, dark brown 1px outline, transparent background, readable at 16px height
```

### Help 牌子 — 独立立式版（区域道具）

```
high top-down view pixel art prop, freestanding wooden sign post with rectangular sign board, narrow wooden post base, white board face with "Help" in dark warm-brown letters, burnt orange border frame, slight shadow on ground, 12x28 sprite, warm wood-white-orange palette, dark brown outline, transparent background, RPG world prop
```

---

## 红色感叹号气泡

> 角色 attention 状态头顶浮动，需要高对比度确保一眼可读

### 感叹号气泡 — 标准版

```
high top-down view pixel art speech bubble effect, circular alert exclamation bubble, white fill with bold warm red exclamation mark "!" in center taking up most of bubble interior, thick warm red border ring around circle edge, slight downward pointer at bottom-center of bubble, 14x16 sprite, high-contrast white and warm red palette, dark brown 1px outline, transparent background, game UI effect style, readable at minimum 12px display size
```

### 感叹号气泡 — 脉冲动画（2帧）

```
pixel art speech bubble animation, 2-frame pulse loop, exclamation alert bubble, frame 1: standard size 14x16 white circle with red "!" and red border, frame 2: slightly larger 16x18 with brighter red border suggesting urgency pulse, smooth loop implying ongoing alert state, horizontal spritesheet 2 frames, transparent background, high-contrast red and white palette
```

---

## 显示器屏幕特效

### 屏幕闪烁光斑（地面反射）

```
pixel art ambient effect, monitor screen light glow cast on desk surface, soft rectangular blue-white light patch, 3-frame flicker animation cycling through dim-medium-bright intensity, edges fade to transparent, 24x16 sprite per frame, horizontal spritesheet 3 frames, blue-white-cyan palette, fully transparent outside glow area, subtle environmental detail not distracting
```

---

## 角色名字标签

> 角色头顶常驻显示，随人物移动，必要时为 Help 牌子或感叹号气泡让位

### 名字标签 — 底板样式

```
pixel art UI element, character name label tag, small horizontal rounded-rectangle background plate, warm cream-white fill #fffbf5, thin dark brown border, slight warm drop shadow offset 1px down-right, placeholder space for pixel text name inside, 40x10 sprite, minimal warm cream palette, dark brown 1px outline, transparent background outside plate, flat friendly design, suitable for floating above a 24px wide character sprite
```

---

## ZZZ 睡眠气泡

### ZZZ 气泡（idle 睡觉变体）

```
high top-down view pixel art speech bubble effect, sleep ZZZ floating text bubble, three letter Z characters in ascending size (small-medium-large reading right to left suggesting drift upward), soft lavender-gray color, slight transparency suggestion, no hard border needed, floating naturally without bubble frame, 20x14 sprite, soft lavender-gray palette, dark brown minimal outline on letters only, transparent background, gentle and readable
```

---

---

# 附：提示词快速参考（全局词根）

每次生成资产时，在提示词头部加入以下固定词根以保持风格一致：

```
high top-down view pixel art, Kairosoft warm atelier style, muted warm earth tones, dark brown 1px pixel outline, transparent background,
```

**角色动画专用词根：**
```
high top-down view, young adult male programmer, green and white plaid flannel shirt, dark indigo jeans, thick messy dark brown hair, white ID badge on chest, 48x48 sprite, dark brown outline, transparent background,
```

区域色调词根对照：

| 区域 | 附加色调词根 |
|------|------------|
| Idle | `warm cream-beige ambient, soft lamp yellow glow` |
| Working | `soft lavender-purple floor, cool blue monitor glow accent` |
| Attention | `dusty rose-salmon floor, burnt orange hazard accent #b95c33` |
| Approval | `warm peach-amber floor, golden ochre light` |
| 中央道路 | `weathered gray-tan cobblestone, neutral transit area` |
