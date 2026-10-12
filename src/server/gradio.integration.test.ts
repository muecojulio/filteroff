import assert from "node:assert/strict";
import { describe, it } from "node:test";
import http from "node:http";
import { runGradioImageJob } from "./gradio.ts";

/**
 * Servidor Gradio simulado que respeta el protocolo del cliente oficial
 * (config → upload → SSE antes del join → process_completed → file=).
 * Registra el orden de las peticiones para detectar la carrera SSE/join.
 */
function startMockGradio(): Promise<{ server: http.Server; port: number; order: string[]; bodies: unknown[] }> {
  const order: string[] = [];
  const bodies: unknown[] = [];
  const server = http.createServer((request, response) => {
    const url = request.url ?? "";
    if (url === "/gradio_api/config" || url === "/config") {
      order.push(`config:${url}`);
      const payload = {
        api_prefix: "/gradio_api",
        components: [
          { id: 1, type: "image", props: {} },
          { id: 2, type: "radio", props: { choices: [["v1.4", "v1.4"]] } },
          { id: 3, type: "slider", props: { value: 2 } },
        ],
        dependencies: [
          { id: 0, trigger: "load", inputs: [3] },
          { id: 5, trigger: "click", inputs: [1, 2] },
        ],
      };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(payload));
      return;
    }
    if (url === "/gradio_api/upload" && request.method === "POST") {
      order.push("upload");
      const chunks: Uint8Array[] = [];
      request.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      request.on("end", () => {
        const text = Buffer.concat(chunks).toString("latin1");
        assert.ok(text.includes('name="files"'), "el multipart debe traer el campo files");
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(["/tmp/gradio/in.jpg"]));
      });
      return;
    }
    if (url.startsWith("/gradio_api/queue/data")) {
      order.push("stream");
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      // Eventos en trozos separados, con una línea `data:` cortada a la mitad
      // para probar el armado parcial del buffer.
      const first = `data: {"msg":"estimation","rank":1}\n\ndata: {"msg":"proc`;
      const second = `ess_completed","success":true,"output":{"data":[{` +
        `"path":"/tmp/gradio/out.png","url":null,"meta":{"_type":"gradio.FileData"}}]}}\n\n` +
        `data: {"msg":"close_stream"}\n\n`;
      response.write(first);
      setTimeout(() => {
        response.write(second);
        setTimeout(() => response.end(), 50);
      }, 40);
      return;
    }
    if (url === "/gradio_api/queue/join" && request.method === "POST") {
      order.push("join");
      const chunks: Uint8Array[] = [];
      request.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      request.on("end", () => {
        bodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ event_id: "ev-1" }));
      });
      return;
    }
    if (url.startsWith("/gradio_api/file=")) {
      order.push(`file:${decodeURIComponent(url.slice("/gradio_api/file=".length))}`);
      // 64+ bytes con firma PNG.
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(80, 7)]);
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(png);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, port, order, bodies });
    });
  });
}

describe("runGradioImageJob contra un servidor Gradio simulado", () => {
  it("corre el pipeline completo y respeta el orden stream → join", async () => {
    const { server, port, order, bodies } = await startMockGradio();
    try {
      const image = new Blob([Buffer.alloc(256, 3)], { type: "image/jpeg" });
      const job = await runGradioImageJob({
        root: `http://127.0.0.1:${port}`,
        kind: "photo",
        image,
        filename: "filteroff.jpg",
        timeoutMs: 15_000,
      });
      assert.equal(job.mime, "image/png");
      assert.equal(job.bytes.length, 88);
      assert.equal(job.bytes[0], 0x89);
      // El stream debe abrirse antes del join (si no, se pierden eventos).
      const streamAt = order.findIndex((entry) => entry === "stream");
      const joinAt = order.findIndex((entry) => entry === "join");
      assert.ok(streamAt >= 0 && joinAt > streamAt, `orden real: ${order.join(" → ")}`);
      // El join lleva la imagen en el primer slot de imagen y el radio con su choice.
      const joinBody = bodies[0] as { fn_index: number; data: unknown[] };
      assert.equal(joinBody.fn_index, 5);
      assert.deepEqual(joinBody.data[0], {
        path: "/tmp/gradio/in.jpg",
        orig_name: "filteroff.jpg",
        meta: { _type: "gradio.FileData" },
      });
      assert.equal(joinBody.data[1], "v1.4");
      // La descarga fue del archivo reportado por process_completed.
      assert.ok(order.some((entry) => entry === "file:/tmp/gradio/out.png"), `orden real: ${order.join(" → ")}`);
    } finally {
      server.close();
      server.closeAllConnections();
    }
  });

  it("falla con 'result' cuando el trabajo termina con error de GPU", async () => {
    const { server, port } = await startMockGradio();
    // Se sustituye el stream para devolver un proceso fallido.
    server.removeAllListeners("request");
    server.on("request", (request, response) => {
      const url = request.url ?? "";
      if (url.startsWith("/gradio_api/queue/data")) {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.write(
          `data: {"msg":"process_completed","success":false,"output":{"error":"You have exceeded your GPU quota"}}\n\n`,
        );
        setTimeout(() => response.end(), 30);
        return;
      }
      if (url === "/gradio_api/config" || url === "/config") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            api_prefix: "/gradio_api",
            components: [{ id: 1, type: "image", props: {} }],
            dependencies: [{ id: 5, trigger: "click", inputs: [1] }],
          }),
        );
        return;
      }
      if (url === "/gradio_api/upload") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(["/tmp/gradio/in.jpg"]));
        return;
      }
      if (url === "/gradio_api/queue/join") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ event_id: "ev-2" }));
        return;
      }
      response.writeHead(404);
      response.end();
    });
    try {
      await assert.rejects(
        runGradioImageJob({
          root: `http://127.0.0.1:${port}`,
          kind: "photo",
          image: new Blob([Buffer.alloc(64)], { type: "image/jpeg" }),
          filename: "filteroff.jpg",
          timeoutMs: 15_000,
        }),
        (error: Error) => error.message === "result",
      );
    } finally {
      server.close();
      server.closeAllConnections();
    }
  });
});
