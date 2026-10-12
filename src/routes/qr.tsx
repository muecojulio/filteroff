import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, QrCode, Smartphone } from "lucide-react";
import { installCode } from "@/server/qr.functions";

export const Route = createFileRoute("/qr")({
  component: QrPage,
  loader: async () => {
    try {
      const data = await installCode();
      return { data };
    } catch {
      return { data: { origin: "", svg: "" } };
    }
  },
});

function QrPage() {
  const { data } = Route.useLoaderData();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (!data.svg) {
      setShowFallback(true);
    }
  }, [data.svg]);

  const dataUri = data.svg
    ? `data:image/svg+xml;base64,${toBase64(data.svg)}`
    : "";
  const isInstallable = data.origin.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(data.origin);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-6 pb-12">
      <header className="rise mb-6 flex items-center justify-between">
        <Link
          to="/"
          className="press flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface"
          aria-label="Volver al estudio"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <p className="text-xs tracking-widest text-muted uppercase">Cuarto oscuro</p>
        <span className="size-11" />
      </header>

      <section className="rise rise-2 mb-6 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/15 text-primary">
          <Smartphone className="size-8" />
        </div>
        <h1 className="font-display text-3xl font-medium leading-tight">Lleva Filteroff en el bolsillo</h1>
        <p className="mt-2 text-sm text-muted">
          Escanea el código con la cámara del teléfono y ábrelo desde ahí. Si la app no está en
          producción todavía, abajo te explicamos cómo hacerlo manualmente.
        </p>
      </section>

      <section className="rise rise-3 space-y-3 rounded-3xl border border-border bg-surface p-5 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-bg/50 px-3 py-1 text-xs text-muted">
          <QrCode className="size-3.5" />
          <span>Instalación directa</span>
        </div>

        {isInstallable && dataUri ? (
          <div className="space-y-3">
            <div className="mx-auto w-56 rounded-3xl bg-fg p-4 shadow-[0_18px_60px_-20px_rgba(224,122,61,0.45)]">
              <img
                src={dataUri}
                alt={`Código QR para instalar Filteroff desde ${data.origin}`}
                className="h-auto w-full"
                width={240}
                height={240}
                loading="eager"
                decoding="async"
              />
            </div>
            <p className="break-all text-xs text-muted">{data.origin}</p>
            <p className="text-xs text-muted">
              Escanealo desde la cámara del teléfono. En iPhone pregunta si quieres abrir el enlace;
              en Android lo lleva al navegador y desde ahí podés instalar la app.
            </p>
          </div>
        ) : showFallback ? (
          <ManualSteps origin={data.origin} />
        ) : (
          <ManualSteps origin={data.origin} />
        )}
      </section>

      <section className="rise rise-4 mt-4 space-y-3 rounded-3xl border border-border bg-surface p-5 text-sm">
        <h2 className="font-display text-xl">En cualquier dispositivo</h2>
        <ol className="list-decimal space-y-2 pl-5 text-muted">
          <li>
            <span className="text-fg">iPhone (Safari):</span> tocá el botón Compartir y elegí
            <em> Agregar a pantalla de inicio</em>. La app se abre después sin barra de Safari.
          </li>
          <li>
            <span className="text-fg">Android (Chrome):</span> abrí el menú <em>⋮</em> y tocá
            <em> Instalar app</em> o <em>Agregar a inicio</em>.
          </li>
          <li>
            <span className="text-fg">Escritorio:</span> Chrome y Edge muestran un botón de
            instalación en la barra de direcciones.
          </li>
        </ol>
        <p className="text-xs text-muted">
          Sin tienda, sin cuenta, sin tracking. La app vive en el teléfono y la actualización llega
          al recargar.
        </p>
      </section>
    </main>
  );
}

function ManualSteps({ origin }: { origin: string }) {
  return (
    <div className="space-y-3 text-left">
      <p className="text-sm text-muted">
        El QR funciona solo con la dirección https de producción. Mientras la app esté en vista
        previa, seguí estos pasos:
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Abrí la app en este navegador.</li>
        <li>
          En <span className="text-fg">iPhone</span>: tocá Compartir → <em>Agregar a pantalla de
          inicio</em>.
        </li>
        <li>
          En <span className="text-fg">Android</span>: menú del navegador → <em>Instalar app</em>.
        </li>
      </ol>
      {origin ? <p className="break-all text-xs text-muted">{origin}</p> : null}
    </div>
  );
}

function toBase64(input: string): string {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(input)));
  return Buffer.from(input, "utf-8").toString("base64");
}
