import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck, Lock, Eye, ServerOff, Trash2, Github, Wrench, ScrollText } from "lucide-react";
import { restoreSummary } from "@/server/stats.functions";

export const Route = createFileRoute("/privacidad")({
  component: PrivacyPage,
  loader: async () => {
    try {
      const summary = await restoreSummary();
      return { summary };
    } catch {
      return { summary: [] as { kind: string; engine: string; n: number }[] };
    }
  },
});

const ENGINE_LABEL: Record<string, string> = {
  cloud: "nube de pago",
  free: "refuerzo gratis",
  local: "motor local",
};

function PrivacyPage() {
  const { summary } = Route.useLoaderData();
  const [updatedAt, setUpdatedAt] = useState<string>("");

  useEffect(() => {
    setUpdatedAt(
      new Date().toLocaleString("es-MX", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  }, []);

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

      <section className="rise rise-2 mb-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary">
          <ShieldCheck className="size-3.5" />
          <span>Sin cuenta, sin tracking, sin muros</span>
        </div>
        <h1 className="font-display text-3xl font-medium leading-tight">Política de privacidad</h1>
        <p className="mt-2 text-sm text-muted">
          Esta política aplica a Filteroff (la app web instalable). Fue escrita en lenguaje claro para
          que sepas qué pasa con tu foto o tu video antes de tocar nada.
        </p>
        {updatedAt ? (
          <p className="mt-2 text-xs text-muted">Última revisión: {updatedAt}</p>
        ) : null}
      </section>

      <Section
        icon={<Wrench className="size-5" />}
        title="Qué hace la app"
        delay="rise-3"
      >
        <p>
          Filteroff abre una foto o un video corto, detecta capas gráficas (stickers, marcos, emoji) y
          las rellena con los píxeles de alrededor. Si la foto nació con un filtro horneado, también
          aplana el color y recupera textura. No convierte fotos en videos ni videos en fotos.
        </p>
      </Section>

      <Section icon={<Lock className="size-5" />} title="Dónde corre el trabajo" delay="rise-4">
        <p>
          El motor principal corre en tu teléfono. La foto nunca se sube a un servidor para ser
          procesada: la detección, el relleno, el balance de grises y la recuperación de textura se
          hacen en el navegador del dispositivo, sin red.
        </p>
      </Section>

      <Section icon={<ServerOff className="size-5" />} title="Cuándo toca un servidor" delay="rise-5">
        <p>
          Solo si pegás un enlace o activás el refuerzo por IA. En ese caso, el servidor:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>descarga el archivo para saltar el bloqueo del navegador (anti-hotlink);</li>
          <li>rechaza destinos internos, IP privadas y metadatos de la nube;</li>
          <li>
            entrega el resultado y se olvida del archivo (sin cache, sin logs con el contenido,
            <code className="mx-1 rounded bg-surface px-1 text-xs">Cache-Control: no-store</code>).
          </li>
        </ul>
      </Section>

      <Section icon={<Eye className="size-5" />} title="Refuerzo IA automático" delay="rise-6">
        <p>
          Si activás el refuerzo, la cadena corre en este orden: <strong>gratis sin registro</strong>
          (apps Gradio públicas) → <strong>nube con cupo</strong> (si existe llave) → <strong>motor
          local</strong>. Si un eslabón falla, el siguiente entra solo. El motor local siempre deja la
          foto lista, así nunca te quedás sin resultado.
        </p>
        <p className="mt-2 text-sm text-muted">
          Las apps Gradio públicas reciben una miniatura JPEG (&lt; 900 px) y nada más. No enviamos el
          enlace original, ni el nombre del archivo, ni la URL de la página de origen.
        </p>
      </Section>

      <Section icon={<Trash2 className="size-5" />} title="Lo que guardamos en tu teléfono" delay="rise-7">
        <p>
          El historial (una miniatura y el nombre) vive en <code className="rounded bg-surface px-1 text-xs">localStorage</code>.
          Lo podés borrar desde la pestaña <em>Historial</em> con un solo toque. La próxima vez que
          recargues la app, ya no está.
        </p>
      </Section>

      <Section icon={<ScrollText className="size-5" />} title="Lo que guardamos en la base" delay="rise-8">
        <p>
          Solo entran conteos anónimos: si fue foto o video, qué motor se usó y cuánto tardó. Nunca
          subimos la imagen, el video, ni el enlace. El último resumen público (últimos 30 días) se
          muestra en la sección de estadísticas de la app.
        </p>
        {summary.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {summary.map((row) => (
              <li key={`${row.kind}-${row.engine}`}>
                30 días · {row.kind === "video" ? "videos" : "fotos"} ·{" "}
                {ENGINE_LABEL[row.engine] ?? row.engine} · {row.n}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted">Aún no hay conteos de los últimos 30 días.</p>
        )}
      </Section>

      <Section icon={<ShieldCheck className="size-5" />} title="Tu responsabilidad al usar la app" delay="rise-9">
        <p>
          <strong>El uso de Filteroff es responsabilidad de la persona que la usa.</strong> La app
          ofrece una herramienta técnica para revertir capas gráficas y filtros horneados en archivos
          que vos mismo proporcionás. No damos consejo legal, médico ni editorial sobre el contenido
          que proceses.
        </p>
        <p className="mt-2 text-sm text-muted">
          En particular: usala solo sobre archivos que tengas derecho a editar, y respetá la
          privacidad y los derechos de imagen de otras personas. La app no almacena el archivo
          procesado, pero el resultado queda en tu dispositivo y vos decidís qué hacer con él.
        </p>
      </Section>

      <Section icon={<Github className="size-5" />} title="Motor abierto" delay="rise-10">
        <p>
          El motor del teléfono y la cadena de refuerzo gratis se apoyan en trabajo público de GitHub,
          copiado y adaptado a esta app:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
          <li>gradio-app/gradio (MIT): protocolo para llamar apps públicas sin key ni registro.</li>
          <li>GFPGAN y SwinIR (Apache-2.0): demos públicas de rostro y reconstrucción.</li>
          <li>OpenCV y scikit-image (BSD): relleno de stickers, CLAHE y balance de grises.</li>
          <li>Dark Channel Prior (Kaiming He): quita la veladura que dejan los filtros con glow.</li>
        </ul>
      </Section>

      <Section icon={<ScrollText className="size-5" />} title="Cambios a esta política" delay="rise-11">
        <p>
          Si modificamos la política, la fecha de arriba se actualiza. Si el cambio es grande (por
          ejemplo, agregar login o subir archivos a un servidor), vamos a pedir confirmación dentro
          de la app antes de que la nueva versión tome efecto.
        </p>
        <p className="mt-2 text-xs text-muted">
          ¿Dudas? El código está abierto en{" "}
          <a
            href="https://github.com/muecojulio/filteroff"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline-offset-2 hover:underline"
          >
            github.com/muecojulio/filteroff
          </a>
          .
        </p>
      </Section>
    </main>
  );
}

function Section({
  icon,
  title,
  children,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  delay: string;
}) {
  return (
    <article className={`rise ${delay} mb-4 space-y-2 rounded-3xl border border-border bg-surface p-4 text-sm leading-relaxed`}>
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <h2 className="font-display text-xl text-fg">{title}</h2>
      </div>
      <div className="space-y-2 text-muted">{children}</div>
    </article>
  );
}
