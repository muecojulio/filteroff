import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findHtmlMediaUrl, sniffMedia } from "./safe-url.ts";

const encoder = new TextEncoder();

describe("sniffMedia", () => {
  it("reconoce AVIF por su marca ftyp antes que mp4", () => {
    const bytes = encoder.encode("    ftypavif0000");
    assert.deepEqual(sniffMedia(bytes, "image/avif"), { mime: "image/avif", kind: "photo" });
  });

  it("sigue reconociendo mp4 genérico", () => {
    const bytes = encoder.encode("    ftypisom0000");
    assert.deepEqual(sniffMedia(bytes, "video/mp4"), { mime: "video/mp4", kind: "video" });
  });

  it("rechaza svg y html declarados", () => {
    assert.equal(sniffMedia(encoder.encode("<svg/>"), "image/svg+xml"), null);
    assert.equal(sniffMedia(encoder.encode("<html></html>"), "text/html; charset=utf-8"), null);
  });
});

describe("findHtmlMediaUrl", () => {
  it("prefiere og:video sobre og:image", () => {
    const html = `
      <html><head>
        <meta property="og:image" content="https://cdn.example.com/cover.jpg">
        <meta property="og:video" content="https://cdn.example.com/clip.mp4">
      </head><body></body></html>`;
    assert.equal(findHtmlMediaUrl(html, "https://example.com/post"), "https://cdn.example.com/clip.mp4");
  });

  it("resuelve urls relativas contra la página", () => {
    const html = `<meta property="og:image" content="/media/foto.png">`;
    assert.equal(findHtmlMediaUrl(html, "https://example.com/a/b"), "https://example.com/media/foto.png");
  });

  it("ignora data: y cae en la primera imagen http", () => {
    const html = `
      <meta property="og:image" content="data:image/png;base64,AAAA">
      <img src="https://imgs.example.com/pic.jpg">`;
    assert.equal(findHtmlMediaUrl(html, "https://example.com"), "https://imgs.example.com/pic.jpg");
  });

  it("acepta twitter:player:stream", () => {
    const html = `<meta name="twitter:player:stream" content="https://cdn.example.com/v.webm">`;
    assert.equal(findHtmlMediaUrl(html, "https://example.com"), "https://cdn.example.com/v.webm");
  });

  it("devuelve null si no hay nada útil", () => {
    assert.equal(findHtmlMediaUrl("<html><body>hola</body></html>", "https://example.com"), null);
  });
});
