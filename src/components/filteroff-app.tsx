import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Aperture,
  Brush,
  Download,
  History as HistoryIcon,
  ImagePlus,
  Link2,
  Loader2,
  Smartphone,
  Trash2,
  WandSparkles,
  Sparkles,
  ChevronRight,
  Cpu,
  Lock,
  Eye,
  Zap,
  TriangleAlert,
  Info,
  Shuffle,
} from "lucide-react";
import { clearHistory, readHistory, writeHistory, type HistoryItem } from "@/lib/history";
import { restoreRaster, type Raster } from "@/lib/restore/engine";
import {
  blobToRaster,
  makeSampleBlob,
  paintMask,
  rasterToBlob,
  restoreVideo,
  shrinkJpeg,
} from "@/lib/restore/raster";
import { recordRestore, restoreSummary } from "@/server/stats.functions";
import { refinePhoto } from "@/server/refine.functions";
import { freeRefine } from "@/server/free-refine.functions";
import { installCode } from "@/server/qr.functions";
import { useToast } from "@/components/ui/use-toast";
import { PressButton, type PressStatus } from "@/components/ui/press-button";
import { Toggle } from "@/components/ui/toggle";
import { Slider } from "@/components/ui/slider";
import { TabBar } from "@/components/ui/tab-bar";
import { useTabIndicator } from "@/components/ui/tab-indicator";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { LiveOrb } from "@/components/ui/live-orb";
import { CompareSlider } from "@/components/ui/compare-slider";
import { SnapCarousel } from "@/components/ui/snap-carousel";
import { SwipeReveal } from "@/components/ui/swipe-reveal";
import { SectionHeader } from "@/components/ui/section-header";
import { useMediaQuery } from "@/lib/reduced-motion";

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

const TAB_ITEMS = [
  { value: "studio", label: "Estudio", icon: <Aperture className="size-4" /> },
  { value: "history", label: "Historial", icon: <HistoryIcon className="size-4" /> },
  { value: "info", label: "Más", icon: <Sparkles className="size-4" /> },
] as const;

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
  const [restoreStatus, setRestoreStatus] = useState<PressStatus>("idle");
  const [urlStatus, setUrlStatus] = useState<PressStatus>("idle");
  const fileRef = useRef<HTMLInputElement>(null);
  const brushRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<Uint8Array | null>(null);
  const drawing = useRef(false);
  const toast = useToast();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // refs para el indicador de tabs.
  const tabScrollerRef = useRef<HTMLDivElement>(null);
  const tabButtonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  useTabIndicator(
    tabScrollerRef as unknown as React.RefObject<HTMLElement>,
    tabButtonsRef as unknown as React.MutableRefObject<Array<HTMLElement | null>>,
    TAB_ITEMS.findIndex((t) => t.value === tab),
  );

  useEffect(() => {
    setHistory(readHistory());
    restoreSummary().then(setSummary).catch(() => setSummary([]));
    installCode().then(setQr).catch(() => setQr(null));
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
      toast.push({ tone: "success", title: "Imagen cargada", body: file.name || "Lista para restaurar." });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el archivo.");
      toast.push({ tone: "error", title: "No se pudo abrir", body: err instanceof Error ? err.message : "" });
    } finally {
      setBusy(null);
    }
  }

  async function onUrl() {
    const target = url.trim();
    if (!target) return;
    setError("");
    setUrlStatus("loading");
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
      setUrlStatus("success");
      toast.push({ tone: "success", title: "Enlace traído", body: label });
    } catch (err) {
      setUrlStatus("error");
      setError(err instanceof Error ? err.message : "No se pudo traer el enlace.");
      toast.push({ tone: "error", title: "No se pudo traer el enlace", body: err instanceof Error ? err.message : "" });
    } finally {
      setBusy(null);
      window.setTimeout(() => setUrlStatus("idle"), 1400);
    }
  }

  async function onSample() {
    setError("");
    setBusy("Preparando ejemplo…");
    try {
      const blob = await makeSampleBlob();
      await adoptBlob(blob, "Ejemplo", "photo");
      toast.push({ tone: "info", title: "Ejemplo cargado", body: "Tocá restaurar para ver el motor local en acción." });
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
    ctx.fillStyle = "rgba(255, 138, 77, 0.45)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  async function restore() {
    if (!loaded || busy) return;
    setError("");
    setNote("");
    setRestoreStatus("loading");
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
          data: {
            kind: "video",
            engine: "local",
            coveredBp: 0,
            durationMs: Math.round(performance.now() - started),
          },
        }).catch(() => undefined);
        setNote("Video listo con el motor local. Se procesaron los primeros 15 segundos.");
        setRestoreStatus("success");
        toast.push({ tone: "success", title: "Video restaurado", body: "Motor local, sin enviar el archivo." });
        return;
      }
      if (!loaded.raster) return;
      setBusy("Restaurando…");
      const local = await restoreRaster(loaded.raster, options, setProgress);
      let finalRaster = local.raster;
      let engine: Engine = "local";
      if (boost) {
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
      setRestoreStatus("success");
      toast.push({
        tone: "success",
        title: engine === "local" ? "Listo en el teléfono" : engine === "free" ? "Refuerzo gratis aplicado" : "Refuerzo de pago aplicado",
        body: covered > 0 ? `Capa gráfica rellenada: ${Math.round(covered * 1000) / 10}%` : "Resultado listo para guardar.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restaurar.");
      setRestoreStatus("error");
      toast.push({ tone: "error", title: "No se pudo restaurar", body: err instanceof Error ? err.message : "" });
    } finally {
      setBusy(null);
      setProgress(0);
      window.setTimeout(() => setRestoreStatus("idle"), 1600);
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
    toast.push({ tone: "success", title: "Guardado", body: loaded.label });
  }

  const installable = Boolean(qr?.origin.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(qr.origin));

  return (
    <div className="relative mx-auto min-h-dvh max-w-lg px-4 pt-6 pb-32">
      {/* Orbes decorativos de fondo — respetan `prefers-reduced-motion`. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className={["absolute -top-20 -right-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl", reducedMotion ? "" : "pulse-soft"].join(" ")}
        />
        <div
          className={["absolute top-1/3 -left-32 h-80 w-80 rounded-full bg-accent/10 blur-3xl", reducedMotion ? "" : "pulse-soft"].join(" ")}
          style={{ animationDelay: "0.6s" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(224,122,61,0.06),transparent_60%)]" />
      </div>

      <header className="rise mb-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow-shimmer text-xs font-semibold uppercase tracking-[0.18em]">Cuarto oscuro</p>
          <h1 className="mt-1 font-display text-4xl font-medium leading-none text-fg">Filteroff</h1>
        </div>
        <LiveOrb className="shrink-0" />
      </header>

      <div className="rise rise-2 mb-5">
        <div
          ref={tabScrollerRef as unknown as React.RefObject<HTMLDivElement>}
          className="relative rounded-full border border-border bg-surface p-1"
        >
          <TabBar
            items={TAB_ITEMS.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))}
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            ariaLabel="Secciones de la app"
            swipeable
            size="md"
            className="tab-indicator"
          />
        </div>
      </div>

      {tab === "studio" ? (
        <StudioTab
          url={url}
          onUrl={setUrl}
          onSubmitUrl={onUrl}
          urlStatus={urlStatus}
          onPickFile={() => fileRef.current?.click()}
          onSample={onSample}
          stickers={stickers}
          setStickers={setStickers}
          natural={natural}
          setNatural={setNatural}
          boost={boost}
          setBoost={setBoost}
          strength={strength}
          setStrength={setStrength}
          sensitivity={sensitivity}
          setSensitivity={setSensitivity}
          loaded={loaded}
          baseRef={baseRef}
          brushRef={brushRef}
          brushOn={brushOn}
          setBrushOn={setBrushOn}
          drawing={drawing}
          pointerPos={pointerPos}
          drawBrush={drawBrush}
          resultUrl={resultUrl}
          covered={covered}
          split={split}
          setSplit={setSplit}
          showOriginal={showOriginal}
          setShowOriginal={setShowOriginal}
          fileRef={fileRef}
          onFile={onFile}
          busy={busy}
          progress={progress}
          error={error}
          note={note}
          restoreStatus={restoreStatus}
          onRestore={restore}
          onDownload={download}
          resultBlob={resultBlob}
        />
      ) : null}

      {tab === "history" ? (
        <HistoryTab
          history={history}
          onClear={() => {
            clearHistory();
            setHistory([]);
            toast.push({ tone: "info", title: "Historial borrado", body: "Solo en este teléfono." });
          }}
          onRemove={(id) => {
            const next = readHistory().filter((h) => h.id !== id);
            writeHistory(next);
            setHistory(next);
            toast.push({ tone: "info", title: "Ítem borrado", body: "Solo en este teléfono." });
          }}
        />
      ) : null}

      {tab === "info" ? (
        <InfoTab qr={qr} installable={installable} summary={summary} />
      ) : null}

      <nav className="dock fixed inset-x-0 bottom-0 z-10 border-t border-border bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto grid max-w-lg grid-cols-3 px-3 pt-2">
          {TAB_ITEMS.map((item) => (
            <DockButton
              key={item.value}
              active={tab === item.value}
              onClick={() => setTab(item.value as Tab)}
              icon={item.icon}
              label={item.label}
            />
          ))}
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
      aria-current={active ? "page" : undefined}
      className={[
        "press relative flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-xs",
        "transition-colors duration-200",
        "focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "touch-manipulation",
        active ? "text-primary" : "text-muted hover:text-fg",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute -top-0.5 h-1 w-8 rounded-full bg-primary transition-opacity duration-200",
          active ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />
      {icon}
      {label}
    </button>
  );
}

function StudioTab(props: {
  url: string;
  onUrl: (v: string) => void;
  onSubmitUrl: () => void;
  urlStatus: PressStatus;
  onPickFile: () => void;
  onSample: () => void;
  stickers: boolean;
  setStickers: (v: boolean) => void;
  natural: boolean;
  setNatural: (v: boolean) => void;
  boost: boolean;
  setBoost: (v: boolean) => void;
  strength: number;
  setStrength: (v: number) => void;
  sensitivity: number;
  setSensitivity: (v: number) => void;
  loaded: Loaded | null;
  baseRef: React.RefObject<HTMLCanvasElement | null>;
  brushRef: React.RefObject<HTMLCanvasElement | null>;
  brushOn: boolean;
  setBrushOn: (v: boolean) => void;
  drawing: React.MutableRefObject<boolean>;
  pointerPos: (event: PointerEvent<HTMLCanvasElement>) => { x: number; y: number } | null;
  drawBrush: (x: number, y: number) => void;
  resultUrl: string | null;
  covered: number;
  split: number;
  setSplit: (v: number) => void;
  showOriginal: boolean;
  setShowOriginal: (v: boolean) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File | undefined) => void;
  busy: string | null;
  progress: number;
  error: string;
  note: string;
  restoreStatus: PressStatus;
  onRestore: () => void;
  onDownload: () => void;
  resultBlob: Blob | null;
}) {
  const {
    url,
    onUrl,
    onSubmitUrl,
    urlStatus,
    onPickFile,
    onSample,
    stickers,
    setStickers,
    natural,
    setNatural,
    boost,
    setBoost,
    strength,
    setStrength,
    sensitivity,
    setSensitivity,
    loaded,
    baseRef,
    brushRef,
    brushOn,
    setBrushOn,
    drawing,
    pointerPos,
    drawBrush,
    resultUrl,
    covered,
    split,
    setSplit,
    showOriginal,
    setShowOriginal,
    fileRef,
    onFile,
    busy,
    progress,
    error,
    note,
    restoreStatus,
    onRestore,
    onDownload,
    resultBlob,
  } = props;

  return (
    <section className="space-y-5">
      <Card tone="bg" padding="md" className="rise rise-3 overflow-hidden">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative">
          <SectionHeader
            eyebrow="Cuarto oscuro en línea"
            title="Pegá un enlace o abrí un archivo"
            subtitle="La foto o el video nunca sale del teléfono. Si pegás un enlace, el servidor solo lo descarga y se olvida."
          />
          <form
            className="mt-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitUrl();
            }}
          >
            <label className="sr-only" htmlFor="media-url">
              Enlace de la foto o el video
            </label>
            <div className="relative min-w-0 flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                id="media-url"
                value={url}
                onChange={(event) => onUrl(event.target.value)}
                placeholder="https://…"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                className="h-12 w-full rounded-2xl border border-border bg-surface pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
              />
            </div>
            <PressButton
              type="submit"
              status={urlStatus}
              icon={<Link2 className="size-4" />}
              label="Traer"
              aria-label="Traer enlace"
              variant="solid"
              size="md"
              disabled={!!busy}
            />
          </form>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <PressButton
              type="button"
              icon={<ImagePlus className="size-4" />}
              label="Del teléfono"
              onClick={onPickFile}
              disabled={!!busy}
            />
            <PressButton
              type="button"
              icon={<WandSparkles className="size-4" />}
              label="Ver ejemplo"
              onClick={onSample}
              disabled={!!busy}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(event) => {
                onFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      </Card>

      <Card padding="md" className="rise rise-4 space-y-3">
        <SectionHeader
          eyebrow="Ajustes"
          title="Cómo querés que restaure"
          trailing={
            <div className="flex flex-wrap gap-1.5">
              <Chip active icon={<Cpu className="size-3.5" />}>Local</Chip>
              <Chip active={boost} icon={<Zap className="size-3.5" />}>Cadena IA</Chip>
            </div>
          }
        />
        <Toggle label="Quitar stickers y marcos" checked={stickers} onChange={setStickers} />
        <Toggle label="Aspecto natural" checked={natural} onChange={setNatural} />
        <Toggle
          label="Refuerzo IA automático"
          hint="Primero gratis y sin registro. Si falla o el cupo se acaba, sigue la cadena sola y el motor local siempre responde."
          checked={boost}
          onChange={setBoost}
        />
        <Slider
          label="Fuerza del natural"
          value={Math.round(strength * 100)}
          min={0}
          max={100}
          onChange={(v) => setStrength(v / 100)}
          format={(v) => `${v}`}
        />
        <Slider
          label="Sensibilidad de stickers"
          value={Math.round(sensitivity * 100)}
          min={0}
          max={100}
          onChange={(v) => setSensitivity(v / 100)}
          format={(v) => `${v}`}
        />
      </Card>

      {loaded?.kind === "photo" && loaded.raster && !resultUrl ? (
        <Card padding="sm" className="rise rise-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="truncate text-sm text-muted">{loaded.label}</p>
            <PressButton
              type="button"
              icon={<Brush className="size-4" />}
              label={brushOn ? "Pincel activo" : "Pincel"}
              onClick={() => setBrushOn(!brushOn)}
              variant={brushOn ? "solid" : "outline"}
              size="sm"
            />
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
          {brushOn ? (
            <p className="text-xs text-muted">Pinta encima de lo que el detector no vea.</p>
          ) : null}
        </Card>
      ) : null}

      {loaded?.kind === "video" && !resultUrl ? (
        <video src={loaded.sourceUrl} controls playsInline className="w-full rounded-2xl border border-border bg-bg" />
      ) : null}

      {resultUrl && loaded?.kind === "photo" ? (
        <Card padding="sm" className="rise rise-5 space-y-2">
          <p className="text-sm text-muted">
            Arrastrá para comparar. {covered > 0 ? `Capa gráfica: ${Math.round(covered * 1000) / 10}%` : "Sin capa gráfica marcada."}
          </p>
          <CompareSlider
            before={loaded.sourceUrl}
            after={resultUrl}
            afterAlt="Foto restaurada"
            value={split}
            onChange={setSplit}
            aspectRatio={`${loaded.raster?.width ?? 1} / ${loaded.raster?.height ?? 1}`}
          />
        </Card>
      ) : null}

      {resultUrl && loaded?.kind === "video" ? (
        <div className="rise rise-5 space-y-2">
          <PressButton
            type="button"
            label={showOriginal ? "Ver limpio" : "Ver original"}
            onClick={() => setShowOriginal(!showOriginal)}
            variant="outline"
            size="sm"
          />
          <video
            src={showOriginal ? loaded.sourceUrl : resultUrl}
            controls
            playsInline
            className="w-full rounded-2xl border border-border bg-bg"
          />
        </div>
      ) : null}

      {busy ? (
        <div className="rise space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" />
            {busy}
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Progreso"
          >
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-2 transition-[width] duration-200"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {note && !error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>{note}</p>
        </div>
      ) : null}

      <div className="rise rise-6 grid grid-cols-2 gap-2">
        <PressButton
          type="button"
          status={restoreStatus}
          onClick={onRestore}
          label={restoreStatus === "loading" ? "Restaurando…" : "Restaurar"}
          variant="solid"
          size="lg"
          disabled={!loaded || !!busy}
          icon={<Shuffle className="size-4" />}
        />
        <PressButton
          type="button"
          onClick={onDownload}
          label="Guardar"
          variant="outline"
          size="lg"
          disabled={!resultBlob}
          icon={<Download className="size-4" />}
        />
      </div>

      <div className="rise rise-7 rounded-2xl border border-border bg-surface/60 p-4 text-xs leading-relaxed text-muted">
        <p className="mb-2 font-medium text-fg">Lo que esta app no hace</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>No convierte fotos en videos ni videos en fotos.</li>
          <li>No cambia la ropa ni inventa otra persona.</li>
          <li>No sube tu foto a un servidor sin pedirlo el refuerzo IA.</li>
          <li>No reemplaza al original: solo suaviza el filtro y rellena stickers.</li>
        </ul>
      </div>
    </section>
  );
}

function HistoryTab({ history, onClear, onRemove }: { history: HistoryItem[]; onClear: () => void; onRemove: (id: string) => void }) {
  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="Solo en este teléfono"
        title="En este teléfono"
        subtitle="Miniaturas y etiquetas. Nada sale del aparato."
        trailing={
          history.length > 0 ? (
            <PressButton
              type="button"
              onClick={onClear}
              icon={<Trash2 className="size-4" />}
              label="Borrar todo"
              variant="ghost"
              size="sm"
            />
          ) : undefined
        }
      />
      {history.length === 0 ? (
        <Card padding="lg" className="rise rise-3 text-center">
          <HistoryIcon className="mx-auto mb-2 size-8 text-muted" />
          <p className="text-sm text-muted">
            Todavía no hay restauraciones guardadas aquí. El historial no sale de este aparato.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {history.map((item) => (
            <SwipeReveal
              key={item.id}
              actions={[
                {
                  label: `Borrar ${item.label}`,
                  tone: "danger",
                  onSelect: () => onRemove(item.id),
                  icon: <Trash2 className="size-4" />,
                },
              ]}
            >
              <div className="flex items-center gap-3 p-2">
                <img src={item.thumb} alt="" className="size-16 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.label}</p>
                  <p className="text-xs text-muted">
                    {item.kind === "video" ? "Video" : "Foto"} ·{" "}
                    {item.engine === "cloud" ? "nube" : item.engine === "free" ? "gratis" : "local"} ·{" "}
                    {new Date(item.at).toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Borrar ${item.label}`}
                  onClick={() => onRemove(item.id)}
                  className="press flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </SwipeReveal>
          ))}
        </ul>
      )}
    </section>
  );
}

function InfoTab({
  qr,
  installable,
  summary,
}: {
  qr: { origin: string; svg: string } | null;
  installable: boolean;
  summary: { kind: string; engine: string; n: number }[];
}) {
  const ENGINE_LABEL: Record<string, string> = {
    cloud: "nube de pago",
    free: "refuerzo gratis",
    local: "motor local",
  };
  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="Cuarto oscuro abierto"
        title="Instalar, reforzar y entender qué pasa"
        subtitle="Sin cuenta. Sin muros. La foto o el video se procesan en tu teléfono."
      />

      <SnapCarousel ariaLabel="Capacidades de la app" peek>
        <Card padding="md" emphasis="glow" className="h-full">
          <div className="flex items-center gap-2 text-primary">
            <Cpu className="size-5" />
            <h2 className="font-display text-xl text-fg">Motor local</h2>
          </div>
          <p className="mt-2 text-sm text-muted">
            Detecta capas gráficas, rellena stickers y aplana el color en tu propio teléfono. La foto no sale.
          </p>
        </Card>
        <Card padding="md" className="h-full">
          <div className="flex items-center gap-2 text-primary">
            <Zap className="size-5" />
            <h2 className="font-display text-xl text-fg">Cadena IA</h2>
          </div>
          <p className="mt-2 text-sm text-muted">
            Primero gratis y sin registro (apps Gradio públicas). Si falla, salta a la nube con cupo. Si se acaba, vuelve a local.
          </p>
        </Card>
        <Card padding="md" className="h-full">
          <div className="flex items-center gap-2 text-primary">
            <Lock className="size-5" />
            <h2 className="font-display text-xl text-fg">Privacidad primero</h2>
          </div>
          <p className="mt-2 text-sm text-muted">
            El historial vive en tu teléfono. La base solo recibe conteos anónimos. Vos sos responsable de lo que proceses.
          </p>
        </Card>
      </SnapCarousel>

      <Card padding="md" className="rise rise-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="size-5 text-primary" />
            <h2 className="font-display text-xl">Llevar en el bolsillo</h2>
          </div>
          <Link
            to="/qr"
            className="press inline-flex h-9 items-center gap-1 rounded-full border border-border bg-bg/60 px-3 text-xs text-fg transition-colors hover:text-primary"
          >
            Ver QR
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
        <p className="text-sm text-muted">
          Es una app instalable, no una página suelta. En iPhone: Compartir y luego Agregar a inicio. En Android:
          el menú del navegador y luego Instalar app.
        </p>
        {installable && qr?.svg ? (
          <div className="flex items-center gap-3">
            <div className="w-24 rounded-xl bg-fg p-1.5">
              <img
                src={`data:image/svg+xml;base64,${toBase64(qr.svg)}`}
                alt={`Código QR para ${qr.origin}`}
                className="h-auto w-full"
                width={96}
                height={96}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-fg">{qr.origin}</p>
              <p className="text-xs text-muted">Escaneá con la cámara del teléfono.</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            El código QR aparece cuando la app está publicada en una dirección https. Mientras tanto, abran la app en el navegador y usen "Agregar a inicio".
          </p>
        )}
      </Card>

      <Card padding="md" className="rise rise-4 space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="size-5 text-primary" />
          <h2 className="font-display text-xl">Tu responsabilidad</h2>
        </div>
        <p className="text-sm text-muted">
          <strong className="text-fg">El uso de Filteroff es responsabilidad de la persona que usa la app.</strong> Procesá solo
          archivos sobre los que tengas derecho a editar y respetá la privacidad e imagen de otras personas.
        </p>
        <Link
          to="/privacidad"
          className="press inline-flex h-9 items-center gap-1 rounded-full border border-border bg-bg/60 px-3 text-xs text-fg transition-colors hover:text-primary"
        >
          Leer la política completa
          <ChevronRight className="size-3.5" />
        </Link>
      </Card>

      {summary.length > 0 ? (
        <Card padding="md" className="rise rise-5">
          <p className="mb-2 text-xs uppercase tracking-widest text-muted">Últimos 30 días</p>
          <ul className="space-y-1 text-sm">
            {summary.map((row) => (
              <li key={`${row.kind}-${row.engine}`} className="flex items-center justify-between">
                <span className="text-fg">
                  {row.kind === "video" ? "Videos" : "Fotos"} · {ENGINE_LABEL[row.engine] ?? row.engine}
                </span>
                <span className="font-mono text-primary">{row.n}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
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

function toBase64(input: string): string {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(input)));
  return Buffer.from(input, "utf-8").toString("base64");
}
