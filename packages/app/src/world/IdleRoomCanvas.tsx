import { useEffect, useRef } from "react";
import {
  AnimatedSprite,
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture
} from "pixi.js";

/* ------------------------------------------------------------------ */
/*  World layout — 2×2 zones + central road                           */
/* ------------------------------------------------------------------ */

const WORLD_W = 480;
const WORLD_H = 480;
const ROAD_W = 16;
const ZONE_S = (WORLD_W - ROAD_W) / 2; // 232

const ZONES = {
  idle:      { x: 0,              y: 0,              w: ZONE_S, h: ZONE_S },
  working:   { x: ZONE_S + ROAD_W, y: 0,              w: ZONE_S, h: ZONE_S },
  attention: { x: 0,              y: ZONE_S + ROAD_W, w: ZONE_S, h: ZONE_S },
  approval:  { x: ZONE_S + ROAD_W, y: ZONE_S + ROAD_W, w: ZONE_S, h: ZONE_S }
} as const;

const ZONE_COLORS: Record<string, number> = {
  idle: 0xe8e0d0, working: 0xe0d8f0, attention: 0xf0c4c0, approval: 0xf5dcc0, road: 0xd6c9b6
};

const WALK_SPEED = 1.0;

type Direction = "north" | "south" | "east" | "west";
export type WorkerState = "idle" | "working" | "approval" | "attention";

/* ------------------------------------------------------------------ */
/*  Asset paths                                                        */
/* ------------------------------------------------------------------ */

const IDLE_BG_PATH = "/pixel-assets/environment/backgrounds/idle/idle.png";
const WORK_BG_PATH = "/pixel-assets/environment/backgrounds/work/work.png";
const SOFA_PATH = "/pixel-assets/environment/props/furniture/sofa.png";

const ROT_PATHS: Record<Direction, string> = {
  north: "/pixel-assets/characters/workers/worker-00/rotations/north.png",
  south: "/pixel-assets/characters/workers/worker-00/rotations/south.png",
  east: "/pixel-assets/characters/workers/worker-00/rotations/east.png",
  west: "/pixel-assets/characters/workers/worker-00/rotations/west.png"
};

function walkPaths(dir: Direction) {
  return Array.from({ length: 4 }, (_, i) =>
    `/pixel-assets/characters/workers/worker-00/animations/walking/${dir}/frame_${String(i).padStart(3, "0")}.png`
  );
}

/* ------------------------------------------------------------------ */
/*  State config                                                       */
/* ------------------------------------------------------------------ */

const STATE_CFG: Record<WorkerState, { label: string; color: string }> = {
  idle:      { label: "",        color: "#8b7d6b" },
  working:   { label: "working", color: "#6b6b9e" },
  approval:  { label: "Help!",  color: "#d86a34" },
  attention: { label: "!",      color: "#c0392b" }
};

function zoneCenter(zone: keyof typeof ZONES, ox = 0, oy = 0) {
  const z = ZONES[zone];
  return { x: z.x + z.w / 2 + ox, y: z.y + z.h / 2 + oy };
}

const STATE_ANCHORS: Record<WorkerState, Array<{ x: number; y: number }>> = {
  idle:      [zoneCenter("idle", -30, 20), zoneCenter("idle", 30, 30), zoneCenter("idle", 0, -20), zoneCenter("idle", -50, 0), zoneCenter("idle", 50, 10)],
  working:   [zoneCenter("working", -30, -20), zoneCenter("working", 30, -10), zoneCenter("working", 0, 20), zoneCenter("working", -50, 10), zoneCenter("working", 50, -10)],
  attention: [zoneCenter("attention", -20, -10), zoneCenter("attention", 20, 10), zoneCenter("attention", 0, 30), zoneCenter("attention", -40, 20), zoneCenter("attention", 40, 0)],
  approval:  [zoneCenter("approval", -20, -20), zoneCenter("approval", 30, 0), zoneCenter("approval", -10, 30), zoneCenter("approval", -50, 10), zoneCenter("approval", 40, 20)]
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function clampWorld(x: number, y: number) { return { x: clamp(x, 8, WORLD_W - 8), y: clamp(y, 8, WORLD_H - 8) }; }
function getDir(dx: number, dy: number): Direction {
  return Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? "east" : "west") : dy >= 0 ? "south" : "north";
}
function nearest(t: Texture) { t.source.scaleMode = "nearest"; }

/* ------------------------------------------------------------------ */
/*  Worker entity                                                      */
/* ------------------------------------------------------------------ */

interface WorkerEntity {
  id: string;
  name: string;
  state: WorkerState;
  targetState: WorkerState;
  container: Container;
  sprite: AnimatedSprite;
  shadow: Graphics;
  highlight: Graphics;
  nameTag: Text;
  stateMarker: Text;
  dir: Direction;
  target: { x: number; y: number };
  moving: boolean;
}

function createWorker(
  id: string, name: string, sx: number, sy: number,
  rot: Record<Direction, Texture>, walk: Record<Direction, Texture[]>
): WorkerEntity {
  const ct = new Container();
  ct.sortableChildren = true;

  const shadow = new Graphics();
  shadow.ellipse(0, 4, 11, 5).fill({ color: 0x311d11, alpha: 0.22 });
  shadow.zIndex = 0;
  ct.addChild(shadow);

  const sprite = new AnimatedSprite(walk.south);
  sprite.anchor.set(0.5, 0.8);
  sprite.animationSpeed = 0.12;
  sprite.loop = true;
  sprite.texture = rot.south;
  sprite.zIndex = 1;
  ct.addChild(sprite);

  const hl = new Graphics();
  hl.circle(0, -15, 18).stroke({ color: 0xf7ead1, width: 2, alpha: 0.95 });
  hl.visible = false;
  hl.zIndex = 2;
  ct.addChild(hl);

  const nameTag = new Text({
    text: name,
    style: { fontFamily: "IBM Plex Mono", fontSize: 8, fill: "#fff7eb",
      stroke: { color: "#422b1e", width: 3, join: "round" as const } }
  });
  nameTag.anchor.set(0.5, 1);
  nameTag.position.set(0, -28);
  nameTag.resolution = 2;
  nameTag.zIndex = 3;
  ct.addChild(nameTag);

  const marker = new Text({
    text: "",
    style: { fontFamily: "IBM Plex Mono", fontSize: 9, fontWeight: "bold", fill: "#d86a34",
      stroke: { color: "#fff7eb", width: 3, join: "round" as const } }
  });
  marker.anchor.set(0.5, 1);
  marker.position.set(0, -38);
  marker.resolution = 2;
  marker.visible = false;
  marker.zIndex = 4;
  ct.addChild(marker);

  ct.position.set(sx, sy);

  return {
    id, name, state: "idle", targetState: "idle",
    container: ct, sprite, shadow, highlight: hl, nameTag, stateMarker: marker,
    dir: "south", target: { x: sx, y: sy }, moving: false
  };
}

function setWorkerTarget(w: WorkerEntity, state: WorkerState, anchorIdx: number) {
  w.targetState = state;
  const anchors = STATE_ANCHORS[state];
  w.target = clampWorld(anchors[anchorIdx % anchors.length].x, anchors[anchorIdx % anchors.length].y);

  const cfg = STATE_CFG[state];
  if (state === "idle") {
    w.stateMarker.visible = false;
  } else {
    w.stateMarker.text = cfg.label;
    w.stateMarker.style.fill = cfg.color;
    w.stateMarker.visible = true;
  }
}

function tickWorker(w: WorkerEntity, rot: Record<Direction, Texture>, walk: Record<Direction, Texture[]>) {
  const dx = w.target.x - w.container.x;
  const dy = w.target.y - w.container.y;
  const dist = Math.hypot(dx, dy);

  if (dist <= WALK_SPEED) {
    w.container.position.set(w.target.x, w.target.y);
    if (w.moving) {
      w.moving = false;
      w.sprite.stop();
      w.sprite.texture = rot[w.dir];
    }
    w.state = w.targetState;
    return;
  }

  const dir = getDir(dx, dy);
  if (dir !== w.dir || !w.moving) {
    w.dir = dir;
    w.sprite.textures = walk[dir];
    w.sprite.play();
    w.moving = true;
  }
  w.container.x += (dx / dist) * WALK_SPEED;
  w.container.y += (dy / dist) * WALK_SPEED;
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

export interface WorkerInfo { id: string; name: string; state: WorkerState; targetState: WorkerState }

export interface WorldHandle {
  getWorkers(): WorkerInfo[];
  /** Sync workers from real session data. Creates/removes/updates as needed. */
  syncSessions(sessions: Array<{ sessionId: string; title: string; state: WorkerState; visibleInWorkshop: boolean }>): void;
  setWorkerState(id: string, state: WorkerState): void;
  setAllState(state: WorkerState): void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  onReady?: (h: WorldHandle) => void;
  onWorkerClick?: (sessionId: string) => void;
}

export function IdleRoomCanvas({ onReady, onWorkerClick }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onWorkerClickRef = useRef(onWorkerClick);
  onWorkerClickRef.current = onWorkerClick;

  useEffect(() => {
    const node = mountRef.current;
    if (!node) return;

    let disposed = false;
    let app: Application | null = null;

    async function setup() {
      const pixi = new Application();
      await pixi.init({
        width: WORLD_W, height: WORLD_H,
        background: ZONE_COLORS.road,
        antialias: false, autoDensity: true, resolution: 1
      });
      if (disposed) { pixi.destroy(true); return; }

      app = pixi;
      node!.appendChild(pixi.canvas);
      pixi.canvas.className = "idle-room-canvas";
      pixi.stage.eventMode = "static";
      pixi.stage.hitArea = new Rectangle(0, 0, WORLD_W, WORLD_H);
      pixi.stage.sortableChildren = true;

      /* --- load textures --- */
      const [idleBgTex, workBgTex, sofaTex] = await Promise.all([
        Assets.load<Texture>(IDLE_BG_PATH), Assets.load<Texture>(WORK_BG_PATH), Assets.load<Texture>(SOFA_PATH)
      ]);
      const rotEntries = await Promise.all(
        (["north", "south", "east", "west"] as Direction[]).map(async (d) =>
          [d, await Assets.load<Texture>(ROT_PATHS[d])] as const)
      );
      const walkEntries = await Promise.all(
        (["north", "south", "east", "west"] as Direction[]).map(async (d) =>
          [d, await Promise.all(walkPaths(d).map((p) => Assets.load<Texture>(p)))] as const)
      );
      if (disposed) return;

      nearest(idleBgTex); nearest(workBgTex); nearest(sofaTex);
      const rot = Object.fromEntries(rotEntries) as Record<Direction, Texture>;
      const walk = Object.fromEntries(walkEntries) as Record<Direction, Texture[]>;
      Object.values(rot).forEach(nearest);
      Object.values(walk).flat().forEach(nearest);

      /* ============================================================ */
      /*  Build the world                                              */
      /* ============================================================ */

      /* zone floors */
      const floor = new Graphics();
      for (const [key, z] of Object.entries(ZONES)) {
        floor.rect(z.x, z.y, z.w, z.h).fill({ color: ZONE_COLORS[key] });
      }
      floor.zIndex = 0;
      pixi.stage.addChild(floor);

      /* road center dashes */
      const roadDeco = new Graphics();
      for (let x = 0; x < WORLD_W; x += 12)
        roadDeco.rect(x, ZONE_S + ROAD_W / 2 - 1, 6, 2).fill({ color: 0xc4b8a4, alpha: 0.5 });
      for (let y = 0; y < WORLD_H; y += 12)
        roadDeco.rect(ZONE_S + ROAD_W / 2 - 1, y, 2, 6).fill({ color: 0xc4b8a4, alpha: 0.5 });
      roadDeco.zIndex = 1;
      pixi.stage.addChild(roadDeco);

      /* zone labels */
      const labelStyle = { fontFamily: "IBM Plex Mono", fontSize: 10, fill: "#00000033", fontWeight: "bold" as const };
      for (const [key, z] of Object.entries(ZONES)) {
        const t = new Text({ text: key.toUpperCase(), style: labelStyle });
        t.anchor.set(0.5, 0); t.position.set(z.x + z.w / 2, z.y + 14); t.resolution = 2; t.zIndex = 2;
        pixi.stage.addChild(t);
      }

      /* idle room background */
      const idleZ = ZONES.idle;
      const idleBg = new Sprite(idleBgTex);
      idleBg.position.set(idleZ.x, idleZ.y);
      idleBg.width = idleZ.w; idleBg.height = idleZ.h;
      idleBg.zIndex = 1;
      pixi.stage.addChild(idleBg);

      /* work room background */
      const workZ = ZONES.working;
      const workBg = new Sprite(workBgTex);
      workBg.position.set(workZ.x, workZ.y);
      workBg.width = workZ.w; workBg.height = workZ.h;
      workBg.zIndex = 1;
      pixi.stage.addChild(workBg);

      /* scene layer (y-sorted) */
      const scene = new Container();
      scene.sortableChildren = true;
      scene.zIndex = 10;
      pixi.stage.addChild(scene);

      /* sofa — shadow directly under the sofa base */
      const sofaX = idleZ.x + 68;
      const sofaY = idleZ.y + 178;
      const sofaShadow = new Graphics();
      sofaShadow.ellipse(sofaX, sofaY + 2, 40, 10).fill({ color: 0x3c2518, alpha: 0.15 });
      sofaShadow.zIndex = sofaY - 1;
      scene.addChild(sofaShadow);

      const sofa = new Sprite(sofaTex);
      sofa.anchor.set(0.5, 1);
      sofa.scale.set(0.38);
      sofa.position.set(sofaX, sofaY);
      sofa.zIndex = Math.round(sofaY);
      scene.addChild(sofa);

      /* placeholder furniture */
      function drawDesk(zx: number, zy: number) {
        const g = new Graphics();
        g.roundRect(zx - 20, zy - 12, 40, 24, 3).fill({ color: 0xc4b090 });
        g.roundRect(zx - 18, zy - 10, 36, 20, 2).fill({ color: 0xddd0b8 });
        g.rect(zx - 8, zy - 10, 16, 10).fill({ color: 0x334455 });
        g.rect(zx - 6, zy - 8, 12, 6).fill({ color: 0x7799cc });
        g.zIndex = Math.round(zy); scene.addChild(g);
      }
      function drawSign(zx: number, zy: number, text: string, color: number) {
        const g = new Graphics();
        g.roundRect(zx - 16, zy - 20, 32, 16, 3).fill({ color: 0xfff8ea });
        g.roundRect(zx - 16, zy - 20, 32, 16, 3).stroke({ color, width: 1.5 });
        g.rect(zx - 1, zy - 4, 2, 8).fill({ color: 0x8b7d6b });
        g.zIndex = Math.round(zy); scene.addChild(g);
        const t = new Text({ text, style: { fontFamily: "IBM Plex Mono", fontSize: 7, fontWeight: "bold", fill: color } });
        t.anchor.set(0.5, 0.5); t.position.set(zx, zy - 12); t.resolution = 2; t.zIndex = Math.round(zy) + 1;
        scene.addChild(t);
      }
      drawSign(ZONES.attention.x + 116, ZONES.attention.y + 70, "!", 0xc0392b);
      drawSign(ZONES.approval.x + 116, ZONES.approval.y + 70, "HELP", 0xd86a34);

      /* --- workers (managed dynamically) --- */
      const workers: WorkerEntity[] = [];

      function ensureWorker(id: string, name: string): WorkerEntity {
        let w = workers.find((e) => e.id === id);
        if (w) {
          if (w.name !== name) { w.name = name; w.nameTag.text = name; }
          return w;
        }
        // create new — start at idle zone center
        const start = zoneCenter("idle", (workers.length % 3 - 1) * 30, workers.length * 12);
        w = createWorker(id, name, start.x, start.y, rot, walk);
        w.container.zIndex = Math.round(start.y);
        scene.addChild(w.container);
        workers.push(w);
        return w;
      }

      function removeWorker(id: string) {
        const idx = workers.findIndex((w) => w.id === id);
        if (idx < 0) return;
        scene.removeChild(workers[idx].container);
        workers[idx].container.destroy({ children: true });
        workers.splice(idx, 1);
      }

      /* ambient glow */
      const glow = new Graphics();
      glow.rect(0, 0, WORLD_W, WORLD_H).fill({ color: 0xffd17c, alpha: 0.03 });
      glow.zIndex = 999;
      pixi.stage.addChild(glow);

      /* tick */
      pixi.ticker.add(() => {
        for (const w of workers) {
          tickWorker(w, rot, walk);
          w.container.zIndex = Math.round(w.container.y);
        }
      });

      /* DOM-level hover + click (PixiJS hit-test bypassed) */
      function workerAtPoint(mx: number, my: number): WorkerEntity | null {
        for (const w of workers) {
          const dist = Math.hypot(mx - w.container.x, my - (w.container.y - 18));
          if (dist < 22) return w;
        }
        return null;
      }

      pixi.canvas.addEventListener("mousemove", (e) => {
        if (disposed) return;
        const rect = pixi.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = workerAtPoint(mx, my);
        pixi.canvas.style.cursor = hit ? "pointer" : "default";
        for (const w of workers) w.highlight.visible = (w === hit);
      });

      pixi.canvas.addEventListener("mouseleave", () => {
        if (disposed) return;
        pixi.canvas.style.cursor = "default";
        for (const w of workers) w.highlight.visible = false;
      });

      pixi.canvas.addEventListener("pointerup", (e) => {
        if (disposed) return;
        const rect = pixi.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = workerAtPoint(mx, my);
        if (hit) onWorkerClickRef.current?.(hit.id);
      });

      /* world handle */
      const handle: WorldHandle = {
        getWorkers: () => workers.map((w) => ({
          id: w.id, name: w.name, state: w.state, targetState: w.targetState
        })),

        syncSessions(sessions) {
          const visibleIds = new Set<string>();

          sessions.forEach((s, i) => {
            if (!s.visibleInWorkshop) return;
            visibleIds.add(s.sessionId);
            const w = ensureWorker(s.sessionId, s.title || s.sessionId.slice(0, 10));
            // only re-target if state actually changed
            if (w.targetState !== s.state) {
              setWorkerTarget(w, s.state, i);
            }
          });

          // remove workers whose sessions are no longer visible
          for (let i = workers.length - 1; i >= 0; i--) {
            if (!visibleIds.has(workers[i].id)) removeWorker(workers[i].id);
          }
        },

        setWorkerState(id, state) {
          const idx = workers.findIndex((w) => w.id === id);
          if (idx < 0) return;
          setWorkerTarget(workers[idx], state, idx);
        },

        setAllState(state) {
          workers.forEach((w, i) => setWorkerTarget(w, state, i));
        }
      };

      onReady?.(handle);
    }

    void setup();
    return () => {
      disposed = true;
      if (app) app.destroy(true, { children: true, texture: false });
    };
  }, [onReady]);

  return <div className="idle-room-mount" ref={mountRef} />;
}
