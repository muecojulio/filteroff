import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { restoreSummary } from "@/server/stats.functions";
import { PrivacyPolicy, type SummaryRow } from "@/components/privacy-policy";

export const Route = createFileRoute("/privacidad")({
  component: PrivacyPage,
  loader: async () => {
    try {
      const summary = await restoreSummary();
      return { summary };
    } catch {
      return { summary: [] as SummaryRow[] };
    }
  },
});

function PrivacyPage() {
  const { summary } = Route.useLoaderData();

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
      </section>

      <div className="rise rise-3">
        <PrivacyPolicy summary={summary} />
      </div>
    </main>
  );
}
