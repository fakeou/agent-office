// When env vars are set (even to ""), use them; otherwise fall back to defaults.
// With Vite proxy, set both to "" so all requests go through the dev server (no CORS).
export const API_BASE: string =
  import.meta.env.VITE_API_BASE !== undefined ? import.meta.env.VITE_API_BASE : "http://127.0.0.1:9001";

export const RELAY_BASE: string =
  import.meta.env.VITE_RELAY_BASE !== undefined ? import.meta.env.VITE_RELAY_BASE : window.location.origin;

export const GODOT_WORKSHOP_URL: string =
  import.meta.env.VITE_GODOT_WORKSHOP_URL !== undefined
    ? import.meta.env.VITE_GODOT_WORKSHOP_URL
    : "/godot/index.html";
