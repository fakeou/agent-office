/// <reference types="vite/client" />

interface Window {
  turnstile?: {
    render: (
      container: string | HTMLElement,
      options: {
        sitekey: string;
        theme?: "light" | "dark";
        callback?: (token: string) => void;
        "expired-callback"?: () => void;
      }
    ) => string;
    reset: (widgetId?: string) => void;
    getResponse: (widgetId?: string) => string;
  };
}
