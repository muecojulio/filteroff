import { createServerFn } from "@tanstack/react-start";

export const installCode = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const QRCode = (await import("qrcode")).default;
  const request = getRequest();
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0]?.trim() ?? "";
  const proto = (request.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
  const origin = host ? `${proto}://${host}` : "";
  if (!origin) return { origin: "", svg: "" };
  const svg = await QRCode.toString(origin, {
    type: "svg",
    margin: 1,
    width: 240,
    color: { dark: "#12110f", light: "#f3efe6" },
  });
  return { origin, svg: String(svg) };
});
