# Filteroff

App instalable para quitar stickers, marcos y el exceso de un filtro en una foto o un video corto, y dejar un aspecto más natural.

El motor principal corre en el teléfono. No pide cuenta ni registro, y no pone muros artificiales: acepta archivos de hasta 25 MB y videos de 15 segundos.

## Qué hace

- **Descarga por URL**: pega el enlace directo de una foto (JPG, PNG, WebP, GIF, AVIF) o video (MP4, WebM), o el enlace de una página que lo publique (se extrae por `og:video` / `og:image`, el truco clásico de los descargadores abiertos).
- **Motor local en el teléfono**: detecta capas gráficas (stickers, emoji, marcos) y las rellena con los alrededores (`inpaint` estilo OpenCV), aplanan el color exagerado y recuperan textura. Nada sale del aparato.
- **Foto nacida con filtro**: si el filtro ya venía horneado, `naturalize` + `polishNatural` lo revierten estadísticamente con técnicas clásicas portadas de repos públicos: balance de grises (OpenCV xphoto), anti-veladura Dark Channel Prior (Kaiming He), CLAHE (OpenCV/scikit-image) y máscara de enfoque (scikit-image).
- **Refuerzo IA automático (cadena sin muros)**:
  1. **Gratis, sin key ni registro**: apps Gradio públicas (GFPGAN, SwinIR) llamadas con el protocolo REST de `gradio-app/gradio` portado en `src/server/gradio.ts` (config → upload → queue/join → SSE → file).
  2. **Nube con cupo** (solo si existe `XAI_API_KEY`): retoque por xAI.
  3. **Motor local**: si un eslabón falla o se queda sin cupo, el siguiente entra solo y el resultado ya está calculado en el teléfono.
- **Video**: se procesan los primeros 15 segundos cuadro a cuadro con el motor local (sin crear videos falsos a partir de fotos).

## Estructura

- `src/lib/restore/engine.ts` — detección de stickers, inpaint y naturalize (local, sin dependencias).
- `src/lib/restore/enhance.ts` — gray-world, dehaze, CLAHE y unsharp portados de repos públicos.
- `src/server/gradio.ts` — cliente REST de apps Gradio públicas (sin key).
- `src/server/free-refine.functions.ts` — cadena de refuerzo gratis (Spaces) configurable con `FREE_REFINE_SPACES`.
- `src/server/refine.functions.ts` — refuerzo xAI opcional (cupo).
- `src/server/safe-url.ts` — descarga segura (anti-SSRF), sniffing de formato y extracción de medio desde páginas.
- `migrations/0003_free_engine.sql` — el motor `free` entra a las estadísticas.

Repositorio público: https://github.com/muecojulio/filteroff
