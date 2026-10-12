import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import * as Switch from "@radix-ui/react-switch";
import {
  Aperture,
  Brush,
  Download,
  Github,
  History,
  ImagePlus,
  Link2,
  Loader2,
  Shield,
  Smartphone,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { clearHistory, readHistory, writeHistory, type HistoryItem } from "@/lib/history";
import { restoreRaster, type Raster } from "@/lib/restore/engine";
import { blobToRaster, makeSampleBlob, paintMask, rasterToBlob, restoreVideo, shrinkJpeg } from "@/lib/restore/raster";
import { recordRestore, restoreSummary } from "@/server/stats.functions";
import { refinePhoto } from "@/server/refine.functions";
import { freeRefine } from "@/server/free-refine.functions";
import { installCode } from "@/server/qr.functions";

type Tab = "studio" | "history" | "info";
type Kind = "photo" | "video";
type Engine = "local" | "free" | "cloud";

type Loaded = {
  kind: Kind;
  label: string;
  sourceUrl: string;
  raster: Raster | null;
  posterUrl: string | null;
};

function revoke(url: string | null | undefined) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

export function FilteroffApp() {
  const [tab, setTab] = useState<Tab>("studio");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [covered, setCovered] = useState(0);
  const [split, setSplit] = useState(56);
  const [stickers, setStickers] = useState(true);
  const [natural, setNatural] = useState(true);
  const [boost, setBoost] = useState(true);
  const [brushOn, setBrushOn] = useState(false);
  const [strength, setStrength] = useState(0.62);
  const [sensitivity, setSensitivity] = useState(0.55);
  const [showOriginal, setShowOriginal] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [summary, setSummary] = useState<{ kind: string; engine: string; n: number }[]>([]);
  const [qr, setQr] = useState<{ origin: string; svg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const brushRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<Uint8Array | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    setHistory(readHistory());
    restoreSummary()
      .then(setSummary)
      .catch(() => setSummary([]));
    installCode()
      .then(setQr)
      .catch(() => setQr(null));
  }, []);

  useEffect(() => {
    const canvas = baseRef.current;
    if (!canvas || !loaded?.raster) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const copy = new Uint8ClampedArray(loaded.raster.width * loaded.raster.height * 4);
    copy.set(loaded.raster.data);
    ctx.putImageData(new ImageData(copy, loaded.raster.width, loaded.raster.height), 0, 0);
    maskRef.current = new Uint8Array(loaded.raster.width * loaded.raster.height);
    const brush = brushRef.current;
    brush?.getContext("2d")?.clearRect(0, 0, brush.width, brush.height);
  }, [loaded]);

  function resetResult() {
    setResultUrl((current) => {
      revoke(current);
      return null;
    });
    setResultBlob(null);
    setCovered(0);
    setNote("");
  }

  function adopt(next: Loaded) {
    setLoaded((current) => {
      revoke(current?.sourceUrl);
      revoke(current?.posterUrl);
      return next;
    });
    resetResult();
    setError("");
    setBrushOn(false);
    setTab("studio");
  }

  async function adoptBlob(blob: Blob, label: string, kind: Kind) {
    if (kind === "video") {
      const sourceUrl = URL.createObjectURL(blob);
      adopt({ kind, label, sourceUrl, raster: null, posterUrl: null });
      return;
    }
    const raster = await blobToRaster(blob);
    const jpeg = await rasterToBlob(raster, 0.9);
    adopt({
      kind: "photo",
      label,
      sourceUrl: URL.createObjectURL(jpeg),
      raster,
      posterUrl: null,
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    const kind: Kind = file.type.startsWith("video/") ? "video" : "photo";
    if (!file.type.startsWith("image/") && kind !== "video") {
      setError("Usa una foto o un video.");
      return;
    }
    try {
      setBusy("Leyendo archivo…");
      await adoptBlob(file, file.name || (kind === "video" ? "Video" : "Foto"), kind);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el archivo.");
    } finally {
      setBusy(null);
    }
  }

  async function onUrl() {
    const target = url.trim();
    if (!target) return;
    setError("");
    setBusy("Trayendo el enlace…");
    try {
      const response = await fetch(`/api/media?url=${encodeURIComponent(target)}`);
      if (!response.ok) throw new Error((await response.text()) || "No se pudo traer el enlace.");
      const blob = await response.blob();
      const kindHeader = response.headers.get("x-filteroff-kind");
      const kind: Kind = kindHeader === "video" || blob.type.startsWith("video/") ? "video" : "photo";
      let label = "Enlace";
      try {
        label = new URL(target).hostname.replace(/^www\./, "");
      } catch {
        label = "Enlace";
      }
      await adoptBlob(blob, label, kind);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo traer el enlace.");
    } finally {
      setBusy(null);
    }
  }

  async function onSample() {
    setError("");
    setBusy("Preparando ejemplo…");
    try {
      const blob = await makeSampleBlob();
      await adoptBlob(blob, "Ejemplo", "photo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el ejemplo.");
    } finally {
      setBusy(null);
    }
  }

  function pointerPos(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = brushRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function drawBrush(x: number, y: number) {
    const canvas = brushRef.current;
    const raster = loaded?.raster;
    const mask = maskRef.current;
    if (!canvas || !raster || !mask) return;
    const radius = Math.max(10, Math.round(Math.min(raster.width, raster.height) * 0.035));
    paintMask(mask, raster.width, raster.height, x, y, radius);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "rgba(224, 122, 61, 0.45)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  async function restore() {
    if (!loaded || busy) return;
    setError("");
    setNote("");
    setProgress(0.04);
    const started = performance.now();
    const options = {
      stickers,
      natural,
      strength,
      sensitivity,
      brush: loaded.kind === "photo" ? maskRef.current : null,
    };
    try {
      if (loaded.kind === "video") {
        setBusy("Limpiando video…");
        const source = await fetch(loaded.sourceUrl).then((response) => response.blob());
        const cleaned = await restoreVideo(source, { ...options, brush: null }, setProgress);
        const nextUrl = URL.createObjectURL(cleaned.video);
        setResultUrl((current) => {
          revoke(current);
          return nextUrl;
        });
        setResultBlob(cleaned.video);
        setCovered(0);
        const thumb = await blobToThumb(cleaned.poster);
        remember(loaded, "local", thumb);
        await recordRestore({
          data: { kind: "video", engine: "local", coveredBp: 0, durationMs: Math.round(performance.now() - started) },
        }).catch(() => undefined);
        setNote("Video listo con el motor local. Se procesaron los primeros 15 segundos.");
        return;
      }
      if (!loaded.raster) return;
      setBusy("Restaurando…");
      const local = await restoreRaster(loaded.raster, options, setProgress);
      let finalRaster = local.raster;
      let engine: Engine = "local";
      if (boost) {
        // Cadena automática: primero gratis sin registro (Spaces públicos);
        // si nadie responde, la nube con cupo; y si se acabó el cupo, la
        // cadena ya pasó por el gratis. El resultado local siempre existe.
        setBusy("Refuerzo gratis (sin registro)…");
        try {
          const imageBase64 = await shrinkJpeg(local.raster, 896, 0.72);
          const free = await freeRefine({ data: { imageBase64 } }).catch(() => ({ ok: false as const, reason: "unavailable" as const }));
          if (free.ok) {
            setBusy("Recibiendo el resultado gratis…");
            const remote = await blobToRaster(await fetch(`data:image/png;base64,${free.imageBase64}`).then((r) => r.blob()));
            finalRaster = remote;
            engine = "free";
            setNote(`Refuerzo gratis aplicado (${free.provider}, sin registro ni llave).`);
          } else {
            setBusy("Refuerzo de pago…");
            const refined = await refinePhoto({ data: { imageBase64 } }).catch(() => ({ ok: false as const, reason: "rejected" as const }));
            if (refined.ok) {
              setBusy("Recibiendo el resultado…");
              const remote = await blobToRaster(await fetch(`data:image/jpeg;base64,${refined.imageBase64}`).then((r) => r.blob()));
              finalRaster = remote;
              engine = "cloud";
              setNote("Refuerzo de pago aplicado. Cuando el cupo se acabe, la cadena salta sola al refuerzo gratis.");
            } else {
              setNote(chainNote(free.reason, refined.reason));
            }
          }
        } catch {
          setNote("El refuerzo no respondió. Se dejó el resultado del motor local, sin gastar más cupo.");
        }
      } else {
        setNote("Listo en el teléfono. La foto no salió del dispositivo.");
      }
      const blob = await rasterToBlob(finalRaster, 0.92);
      const nextUrl = URL.createObjectURL(blob);
      setResultUrl((current) => {
        revoke(current);
        return nextUrl;
      });
      setResultBlob(blob);
      setCovered(local.covered);
      const thumb = await blobToThumb(blob);
      remember(loaded, engine, thumb);
      await recordRestore({
        data: {
          kind: "photo",
          engine,
          coveredBp: Math.round(local.covered * 10_000),
          durationMs: Math.round(performance.now() - started),
        },
      }).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restaurar.");
    } finally {
      setBusy(null);
      setProgress(0);
    }
  }

  function remember(source: Loaded, engine: Engine, thumb: string) {
    const item: HistoryItem = {
      id: `${Date.now()}`,
      at: Date.now(),
      kind: source.kind,
      label: source.label,
      engine,
      thumb,
    };
    setHistory(writeHistory([item, ...readHistory()]));
  }

  function download() {
    if (!resultBlob || !loaded) return;
    const a = document.createElement("a");
    const href = URL.createObjectURL(resultBlob);
    a.href = href;
    a.download = loaded.kind === "video" ? "filteroff.webm" : "filteroff.jpg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1500);
  }

  const installable = Boolean(qr?.origin.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(qr.origin));

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pt-6 pb-28">
      <header className="rise mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest text-muted uppercase">Cuarto oscuro</p>
          <h1 className="font-display text-4xl leading-none font-medium text-fg">Filteroff</h1>
        </div>
        <Aperture className="mb-1 size-8 text-primary" aria-hidden="true" />
      </header>

      {tab === "studio" ? (
        <section className="space-y-4">
          <p className="rise rise-2 text-sm text-muted">
            Pega el enlace de una foto o un video (directo, o de la página que lo publica), o abre un archivo. Se
            quitan stickers, marcos y el exceso del filtro, sin registro y sin muros. Lo que ya era la foto se
            queda, más natural.
          </p>
          <form
            className="rise rise-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void onUrl();
            }}
          >
            <label className="sr-only" htmlFor="media-url">
              Enlace de la foto o el video
            </label>
            <input
              id="media-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              className="h-12 min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!!busy}
              className="press flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-bg disabled:opacity-50"
              aria-label="Traer enlace"
            >
              <Link2 className="size-5" />
            </button>
          </form>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="press flex h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-sm"
              onClick={() => fileRef.current?.click()}
              disabled={!!busy}
            >
              <ImagePlus className="size-4" />
              Del teléfono
            </button>
            <button
              type="button"
              className="press flex h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-sm"
              onClick={() => void onSample()}
              disabled={!!busy}
            >
              <WandSparkles className="size-4" />
              Ver ejemplo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(event) => {
                void onFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
            <Toggle label="Quitar stickers y marcos" checked={stickers} onChange={setStickers} />
            <Toggle label="Aspecto natural" checked={natural} onChange={setNatural} />
            <Toggle
              label="Refuerzo IA automático"
              hint="Primero gratis y sin registro. Si falla o el cupo se acaba, sigue la cadena sola y el motor local siempre responde."
              checked={boost}
              onChange={setBoost}
            />
            <label className="block text-sm">
              <span className="mb-2 flex justify-between text-muted">
                Fuerza del natural
                <span className="text-fg">{Math.round(strength * 100)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(strength * 100)}
                onChange={(event) => setStrength(Number(event.target.value) / 100)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-2 flex justify-between text-muted">
                Sensibilidad de stickers
                <span className="text-fg">{Math.round(sensitivity * 100)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(sensitivity * 100)}
                onChange={(event) => setSensitivity(Number(event.target.value) / 100)}
              />
            </label>
          </div>

          {loaded?.kind === "photo" && loaded.raster && !resultUrl ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">{loaded.label}</p>
                <button
                  type="button"
                  className={`press flex h-11 items-center gap-2 rounded-full px-4 text-sm ${brushOn ? "bg-primary text-bg" : "border border-border bg-surface"}`}
                  onClick={() => setBrushOn((value) => !value)}
                >
                  <Brush className="size-4" />
                  Pincel
                </button>
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-border bg-bg">
                <canvas
                  ref={baseRef}
                  width={loaded.raster.width}
                  height={loaded.raster.height}
                  className="block h-auto w-full"
                />
                <canvas
                  ref={brushRef}
                  width={loaded.raster.width}
                  height={loaded.raster.height}
                  className={`absolute inset-0 h-full w-full ${brushOn ? "touch-none" : "pointer-events-none"}`}
                  onPointerDown={(event) => {
                    if (!brushOn) return;
                    drawing.current = true;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const pos = pointerPos(event);
                    if (pos) drawBrush(pos.x, pos.y);
                  }}
                  onPointerMove={(event) => {
                    if (!drawing.current || !brushOn) return;
                    const pos = pointerPos(event);
                    if (pos) drawBrush(pos.x, pos.y);
                  }}
                  onPointerUp={() => {
                    drawing.current = false;
                  }}
                />
              </div>
              {brushOn ? <p className="text-xs text-muted">Pinta encima de lo que el detector no vea.</p> : null}
            </div>
          ) : null}

          {loaded?.kind === "video" && !resultUrl ? (
            <video src={loaded.sourceUrl} controls playsInline className="w-full rounded-2xl border border-border bg-bg" />
          ) : null}

          {resultUrl && loaded?.kind === "photo" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted">
                Arrastra para comparar. {covered > 0 ? `Capa gráfica: ${Math.round(covered * 1000) / 10}%` : "Sin capa gráfica marcada."}
              </p>
              <div
                className="relative overflow-hidden rounded-2xl border border-border bg-bg"
                style={{ aspectRatio: `${loaded.raster?.width ?? 1} / ${loaded.raster?.height ?? 1}` }}
              >
                <img src={resultUrl} alt="Foto restaurada" className="absolute inset-0 h-full w-full object-contain" />
                <img
                  src={loaded.sourceUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-contain"
                  style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                />
                <input
                  aria-label="Comparar antes y después"
                  type="range"
                  min={2}
                  max={98}
                  value={split}
                  onChange={(event) => setSplit(Number(event.target.value))}
                  className="absolute inset-x-4 bottom-4"
                />
              </div>
            </div>
          ) : null}

          {resultUrl && loaded?.kind === "video" ? (
            <div className="space-y-2">
              <button
                type="button"
                className="press h-11 rounded-full border border-border px-4 text-sm"
                onClick={() => setShowOriginal((value) => !value)}
              >
                {showOriginal ? "Ver limpio" : "Ver original"}
              </button>
              <video
                src={showOriginal ? loaded.sourceUrl : resultUrl}
                controls
                playsInline
                className="w-full rounded-2xl border border-border bg-bg"
              />
            </div>
          ) : null}

          {busy ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" />
                {busy}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-primary">{error}</p> : null}
          {note ? <p className="text-sm text-muted">{note}</p> : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!loaded || !!busy}
              onClick={() => void restore()}
              className="press h-12 rounded-2xl bg-primary text-sm font-medium text-bg disabled:opacity-40"
            >
              Restaurar
            </button>
            <button
              type="button"
              disabled={!resultBlob}
              onClick={download}
              className="press flex h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-sm disabled:opacity-40"
            >
              <Download className="size-4" />
              Guardar
            </button>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Un filtro ya mezclado no se puede deshacer al pixel original. Esto recupera textura, aplana el color
            excesivo y rellena stickers con lo que hay alrededor. No cambia ropa ni inventa otra persona, y no
            convierte una foto en video.
          </p>
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl">En este teléfono</h2>
            <button
              type="button"
              className="press flex h-11 items-center gap-2 rounded-full border border-border px-3 text-sm"
              onClick={() => {
                clearHistory();
                setHistory([]);
              }}
            >
              <Trash2 className="size-4" />
              Borrar
            </button>
          </div>
          {history.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
              Todavía no hay restauraciones guardadas aquí. El historial no sale de este aparato.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((item) => (
                <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2">
                  <img src={item.thumb} alt="" className="size-16 rounded-xl object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{item.label}</p>
                    <p className="text-xs text-muted">
                      {item.kind === "video" ? "Video" : "Foto"} ·{" "}
                      {item.engine === "cloud" ? "nube de pago" : item.engine === "free" ? "refuerzo gratis" : "local"} ·{" "}
                      {new Date(item.at).toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "info" ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <Smartphone className="size-5 text-primary" />
              <h2 className="font-display text-2xl">Instalar</h2>
            </div>
            <p className="mb-3 text-sm text-muted">
              Es una app instalable, no una página suelta. En iPhone: Compartir y luego Agregar a inicio. En Android:
              el menú del navegador y luego Instalar.
            </p>
            {qr && installable && qr.svg.startsWith("<svg") && !qr.svg.includes("<script") ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-48 rounded-2xl bg-fg p-3" dangerouslySetInnerHTML={{ __html: qr.svg }} />
                <p className="text-center text-xs break-all text-muted">{qr.origin}</p>
              </div>
            ) : (
              <p className="text-sm text-muted">
                El código QR de instalación usa la dirección https de producción. Aparece aquí en cuanto la app está
                publicada. Mientras tanto, ábrela desde este chat y usa Agregar a inicio cuando el enlace sea https.
              </p>
            )}
          </div>

          <article className="space-y-3 rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed">
            <div className="flex items-center gap-2">
              <Shield className="size-5 text-primary" />
              <h2 className="font-display text-2xl">Privacidad</h2>
            </div>
            <p>La foto o el video se procesan en tu teléfono con un motor local, sin cuenta y sin registro.</p>
            <p>
              Si pegas un enlace, nuestro servidor solo lo descarga para saltar el bloqueo del navegador. No se guarda
              el archivo ni la dirección. Se rechazan enlaces a redes internas.
            </p>
            <p>
              El refuerzo IA es automático y empieza por lo gratis: apps públicas que no piden key ni registro. Solo
              si nadie responde se usa la nube con cupo, y cuando el cupo se acaba la cadena vuelve sola al refuerzo
              gratis y al motor local.
            </p>
            <p>
              El historial (una miniatura y el nombre) vive en este aparato. Puedes borrarlo. En la base solo entran
              conteos anónimos: foto o video, motor usado y duración. Sin imagen y sin enlace.
            </p>
            <p>No vendemos datos. No hay perfil. Filteroff no cambia la ropa ni inventa desnudos: eso no es quitar un filtro.</p>
            {summary.length > 0 ? (
              <ul className="text-xs text-muted">
                {summary.map((row) => (
                  <li key={`${row.kind}-${row.engine}`}>
                    30 días · {row.kind === "video" ? "videos" : "fotos"} ·{" "}
                    {row.engine === "cloud" ? "nube de pago" : row.engine === "free" ? "refuerzo gratis" : "local"} ·{" "}
                    {row.n}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">Aún no hay conteos de los últimos 30 días.</p>
            )}
          </article>

          <article className="space-y-3 rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed">
            <div className="flex items-center gap-2">
              <Github className="size-5 text-primary" />
              <h2 className="font-display text-2xl">Motor abierto</h2>
            </div>
            <p>
              El motor del teléfono y la cadena de refuerzo gratis se apoyan en trabajo público de GitHub, copiado y
              adaptado a esta app:
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
              <li>gradio-app/gradio (MIT): protocolo para llamar apps públicas sin key ni registro.</li>
              <li>GFPGAN y SwinIR (Apache-2.0): demos públicas de rostro y reconstrucción.</li>
              <li>OpenCV y scikit-image (BSD): relleno de stickers, CLAHE y balance de grises.</li>
              <li>Dark Channel Prior (Kaiming He): quita la veladura que dejan los filtros con glow.</li>
            </ul>
            <p className="text-xs text-muted">
              Cadena automática: motor local (el teléfono) → refuerzo gratis (Spaces públicos) → nube con cupo (si
              existe). Si un eslabón se queda sin cupo o está dormido, el siguiente entra solo, y el resultado
              siempre llega.
            </p>
          </article>
        </section>
      ) : null}

      <nav className="dock fixed inset-x-0 bottom-0 z-10 border-t border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-3 px-2 pt-2">
          <DockButton active={tab === "studio"} onClick={() => setTab("studio")} icon={<Aperture className="size-5" />} label="Estudio" />
          <DockButton active={tab === "history"} onClick={() => setTab("history")} icon={<History className="size-5" />} label="Historial" />
          <DockButton active={tab === "info"} onClick={() => setTab("info")} icon={<Shield className="size-5" />} label="Instalar" />
        </div>
      </nav>
    </div>
  );
}

function DockButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press flex h-14 flex-col items-center justify-center gap-1 text-xs ${active ? "text-primary" : "text-muted"}`}
    >
      {icon}
      {label}
    </button>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm">{label}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="press relative h-7 w-12 shrink-0 rounded-full border border-border bg-bg data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      >
        <Switch.Thumb className="block size-5 translate-x-1 rounded-full bg-fg transition-transform duration-200 ease-out data-[state=checked]:translate-x-6 data-[state=checked]:bg-bg" />
      </Switch.Root>
    </div>
  );
}

function chainNote(freeReason: "off" | "cooldown" | "unavailable", paidReason: "off" | "quota" | "cooldown" | "rejected") {
  if (freeReason === "unavailable" && paidReason === "rejected") {
    return "Los refuerzos no respondieron ahora mismo. Se dejó el resultado del motor local, igual de limpio.";
  }
  if (paidReason === "quota") return "Cupo de IA agotado y el gratis ocupado. El motor local dejó la foto lista, sin registro.";
  if (paidReason === "cooldown" || freeReason === "cooldown") return "Los refuerzos piden un momento. Se dejó el resultado local.";
  if (paidReason === "off") return "El refuerzo gratis no respondió y no hay nube de pago aquí. El motor local dejó la foto lista.";
  return "Los refuerzos rechazaron esta imagen. Se dejó el resultado local, sin cambiar la ropa ni el rostro.";
}

async function blobToThumb(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = 160 / Math.max(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } finally {
    bitmap.close();
  }
}
