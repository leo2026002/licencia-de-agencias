import { _android as android } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { checkNativeFlow } from "./native-flow.mjs";

await mkdir("native-test-results", { recursive: true });
const [device] = await android.devices();
assert.ok(device, 'No se encontró el teléfono emulado');
device.setDefaultTimeout(60_000);
try {
  const webview = await device.webView({pkg:'com.leo2026002.licencias'});
  const page = await webview.page();
  await checkNativeFlow(page, "Android");
} catch (error) {
  await writeFile('native-test-results/Android-arranque.png',execFileSync('adb',['exec-out','screencap','-p']));
  const logs = execFileSync('adb',['logcat','-d','-t','300'],{encoding:'utf8'});
  await writeFile('native-test-results/Android-logcat.txt',logs);
  console.error('Diagnóstico Android:',logs.split('\n').filter(l=>/FATAL|AndroidRuntime|Capacitor|chromium|WebView|Exception/.test(l)).slice(-55).join('\n'));
  throw error;
} finally {
  await device.close();
}
