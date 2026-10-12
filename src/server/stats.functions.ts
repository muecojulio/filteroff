import { createServerFn } from "@tanstack/react-start";

const KINDS = new Set(["photo", "video"]);
const ENGINES = new Set(["local", "free", "cloud"]);

export const recordRestore = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Registro inválido");
    const row = input as { kind?: unknown; engine?: unknown; coveredBp?: unknown; durationMs?: unknown };
    if (typeof row.kind !== "string" || !KINDS.has(row.kind)) throw new Error("Registro inválido");
    if (typeof row.engine !== "string" || !ENGINES.has(row.engine)) throw new Error("Registro inválido");
    return {
      kind: row.kind,
      engine: row.engine,
      coveredBp: Math.max(0, Math.min(10_000, Math.round(Number(row.coveredBp) || 0))),
      durationMs: Math.max(0, Math.min(600_000, Math.round(Number(row.durationMs) || 0))),
    };
  })
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const recent = await sql<{ n: number }>`
      select count(*)::int as n from restore_stats
      where created_at > now() - interval '1 day'
    `;
    if ((recent[0]?.n ?? 0) > 5000) return { ok: true as const, stored: false as const };
    await sql`
      insert into restore_stats (media_kind, engine, covered_bp, duration_ms)
      values (${data.kind}, ${data.engine}, ${data.coveredBp}, ${data.durationMs})
    `;
    return { ok: true as const, stored: true as const };
  });

export const restoreSummary = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ media_kind: string; engine: string; n: number }>`
    select media_kind, engine, count(*)::int as n
    from restore_stats
    where created_at > now() - interval '30 days'
    group by media_kind, engine
    order by media_kind, engine
  `;
  return rows.map((row) => ({
    kind: row.media_kind,
    engine: row.engine,
    n: Number(row.n) || 0,
  }));
});

export async function cloudBudgetOpen(): Promise<boolean> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from restore_stats
    where engine = 'cloud' and created_at > now() - interval '1 hour'
  `;
  return (rows[0]?.n ?? 0) < 6;
}
