import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            "/tunnel": { target: "http://127.0.0.1:9000", ws: true },
            "/api": "http://127.0.0.1:9001"
        }
    }
});
