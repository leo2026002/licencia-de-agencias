import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { checkNativeFlow } from "./native-flow.mjs";

await mkdir("native-test-results", { recursive: true });
let browser;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const sockets = execFileSync("adb", ["shell", "cat", "/proc/net/unix"], {
      encoding: "utf8",
    });
    const socket = sockets.match(/@(webview_devtools_remote[^\s]*)/)?.[1];
    if (socket) {
      execFileSync("adb", ["forward", "tcp:9222", `localabstract:${socket}`]);
      browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
      break;
    }
  } catch {
    /* Esperar a que WebView termine de arrancar. */
  }
  await pause(1000);
}
assert.ok(
  browser,
  "No se pudo conectar con la WebView de la aplicación Android instalada",
);
try {
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page =
    pages.find((page) => page.url().startsWith("https://localhost")) ||
    pages[0];
  assert.ok(page, "No se encontró la ventana de la aplicación Android");
  await checkNativeFlow(page, "Android");
} finally {
  await browser.close();
}
