import { useEffect } from "react";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { ToastProvider } from "@/components/ui/toast";
import { registerServiceWorker } from "@/lib/sw-register";
import appCss from "../styles.css?url";

const APP_NAME = "Filteroff";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Quita stickers y filtros de una foto o un video y deja un aspecto más natural. Se instala en el teléfono. Sin cuenta, sin muros.",
      },
      { name: "theme-color", content: "#0f0d0b" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,520;9..144,640&family=Outfit:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: RootShell,
});

function RootShell() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <HeadContent />
        <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://grok.com; connect-src 'self' https:; frame-ancestors 'self' https://grok.com https://*.grok.com; base-uri 'self'; form-action 'self';" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta name="x-content-type-options" content="nosniff" />
        <meta httpEquiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=()" />
      </head>
      <body>
        <PreviewHostBridge />
        <ToastProvider>
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        </ToastProvider>
        <Scripts />
      </body>
    </html>
  );
}
