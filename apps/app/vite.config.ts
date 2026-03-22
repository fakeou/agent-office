import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";

const GAME_DIR = new URL("../game-frontend/game-html", import.meta.url).pathname;

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".wasm": "application/wasm",
  ".pck": "application/octet-stream",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function copyDirSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDirSync(s, d) : fs.copyFileSync(s, d);
  }
}

function godotPlugin() {
  return {
    name: "godot-static",
    configureServer(server: any) {
      server.middlewares.use("/godot", (req: any, res: any, next: any) => {
        const relPath = req.url === "/" ? "/index.html" : req.url;
        const abs = path.join(GAME_DIR, relPath);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          const ext = path.extname(abs);
          res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
          res.end(fs.readFileSync(abs));
        } else {
          next();
        }
      });
    },
    writeBundle(options: { dir?: string }) {
      const buildDir = options.dir ? path.resolve(options.dir) : path.resolve("dist");
      copyDirSync(GAME_DIR, path.join(buildDir, "godot"));
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), godotPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/tunnel": { target: "http://127.0.0.1:9000", ws: true },
      "/api": "http://127.0.0.1:9001"
    }
  }
});
