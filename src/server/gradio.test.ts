import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildJoinInputs,
  extractResultFileData,
  gradioFileUrl,
  parseSsePayloads,
  pickImageEndpoint,
  type GradioConfig,
} from "./gradio.ts";

describe("gradio sse parsing", () => {
  it("extrae los payloads JSON de un stream SSE", () => {
    const raw = [
      ": keep-alive",
      "event: heartbeat",
      'data: {"msg":"heartbeat"}',
      "",
      'data: {"msg":"process_starts","success":true}',
      "data: not-json",
      "",
    ].join("\n");
    const payloads = parseSsePayloads(raw);
    assert.equal(payloads.length, 2);
    assert.deepEqual(payloads[0], { msg: "heartbeat" });
    assert.deepEqual(payloads[1], { msg: "process_starts", success: true });
  });

  it("encuentra el archivo resultado dentro de process_completed", () => {
    const payloads = [
      { msg: "heartbeat" },
      {
        msg: "process_completed",
        success: true,
        output: {
          data: [
            { path: "/tmp/gradio/out.png", url: null, meta: { _type: "gradio.FileData" } },
            "placeholder path",
          ],
        },
      },
    ];
    const file = extractResultFileData(payloads);
    assert.ok(file);
    assert.equal(file.path, "/tmp/gradio/out.png");
  });

  it("rechaza un trabajo terminado con error", () => {
    const payloads = [
      {
        msg: "process_completed",
        success: false,
        output: { data: [], error: "You have exceeded your GPU quota" },
      },
    ];
    assert.equal(extractResultFileData(payloads), null);
  });

  it("arma la url de descarga con /file=", () => {
    assert.equal(
      gradioFileUrl("https://demo.hf.space", "/gradio_api", { path: "/tmp/gradio/a.png" }),
      "https://demo.hf.space/gradio_api/file=/tmp/gradio/a.png",
    );
    assert.equal(
      gradioFileUrl("https://demo.hf.space", "", { path: "b.png", url: "https://cdn.hf.space/x.png" }),
      "https://cdn.hf.space/x.png",
    );
  });
});

describe("gradio endpoint picking", () => {
  const config: GradioConfig = {
    api_prefix: "/gradio_api",
    components: [
      { id: 1, type: "image", props: {} },
      { id: 2, type: "radio", props: { choices: [{ value: "v1.4" }] } },
      { id: 3, type: "slider", props: { value: 1 } },
      { id: 10, type: "image", props: {} },
    ],
    dependencies: [
      { id: 0, api_name: "load_example", trigger: "load", inputs: [10] },
      { id: 5, api_name: "predict", trigger: "click", inputs: [1, 2, 3] },
    ],
  };

  it("elige la dependencia con imagen disparada por botón", () => {
    const picked = pickImageEndpoint(config, "photo");
    assert.ok(picked);
    assert.equal(picked.fnIndex, 5);
    assert.equal(picked.apiPrefix, "/gradio_api");
    assert.deepEqual(picked.inputTypes, ["image", "radio", "slider"]);
  });

  it("arma entradas: imagen subida primero y valores por defecto después", () => {
    const inputs = buildJoinInputs(
      ["image", "radio", "slider"],
      "/tmp/gradio/in.png",
      "filteroff.jpg",
      config.components ?? [],
      [1, 2, 3],
    );
    assert.deepEqual(inputs[0], {
      path: "/tmp/gradio/in.png",
      orig_name: "filteroff.jpg",
      meta: { _type: "gradio.FileData" },
    });
    assert.equal(inputs[1], "v1.4");
    assert.equal(inputs[2], 1);
  });
});
