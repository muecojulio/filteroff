import { useEffect, useRef } from "react";

/**
 * Esfera orgánica animada para la cabecera. Dibuja un blob procedural sobre
 * un canvas con tres capas (resplandor, blob principal y un highlight) y
 * gradientes que cambian con el tiempo. No usa imágenes externas: la app se
 * siente viva sin assets adicionales.
 *
 *  - Respeta `prefers-reduced-motion` (heredado del CSS global y se reduce
 *    con la media query de JS aquí también).
 *  - Es decorativo: `aria-hidden`.
 */
export function LiveOrb({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let frame = 0;
    let raf = 0;
    const start = performance.now();

    const draw = () => {
      const t = (performance.now() - start) / 1000;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w * 0.5;
      const cy = h * 0.55;
      const baseR = Math.min(w, h) * 0.32;

      ctx.clearRect(0, 0, w, h);

      // Halo exterior (gradiente radial cálido).
      const halo = ctx.createRadialGradient(cx, cy, baseR * 0.4, cx, cy, baseR * 1.8);
      halo.addColorStop(0, "rgba(224, 122, 61, 0.45)");
      halo.addColorStop(0.45, "rgba(224, 122, 61, 0.12)");
      halo.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Blob principal (curva senoidal deformada).
      const points = 18;
      const wobble = reduced ? 0 : 0.08 + 0.04 * Math.sin(t * 0.7);
      const speed = reduced ? 0.0 : 1;
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const noise = Math.sin(angle * 3 + t * speed) * 0.5 + Math.cos(angle * 5 - t * 0.8) * 0.5;
        const r = baseR * (1 + wobble * noise);
        const x = cx + Math.cos(angle + frame * 0.01) * r;
        const y = cy + Math.sin(angle + frame * 0.012) * r * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "rgba(243, 239, 230, 0.95)");
      grad.addColorStop(0.5, "rgba(243, 239, 230, 0.7)");
      grad.addColorStop(1, "rgba(224, 122, 61, 0.85)");
      ctx.fillStyle = grad;
      ctx.shadowColor = "rgba(224, 122, 61, 0.55)";
      ctx.shadowBlur = reduced ? 0 : 30;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Highlight especular.
      ctx.beginPath();
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.ellipse(cx - baseR * 0.35, cy - baseR * 0.45, baseR * 0.18, baseR * 0.1, -0.6, 0, Math.PI * 2);
      ctx.fill();

      if (!reduced) {
        frame += 1;
        raf = requestAnimationFrame(draw);
      }
    };
    draw();

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={["pointer-events-none h-32 w-32", className ?? ""].join(" ")}
    />
  );
}
