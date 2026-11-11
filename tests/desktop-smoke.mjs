import { _electron as electron } from "playwright-core";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkNativeFlow } from "./native-flow.mjs";

await mkdir("native-test-results", { recursive: true });
const userData = await mkdtemp(path.join(tmpdir(), "licencias-smoke-"));
const packaged = process.env.DESKTOP_EXECUTABLE;
const app = await electron.launch({
  ...(packaged
    ? { executablePath: packaged, args: [] }
    : {
        executablePath: (await import("electron")).default,
        args: ["desktop/main.cjs"],
      }),
  env: { ...process.env, LICENCIAS_TEST_DATA: userData },
  timeout: 60_000,
});
try {
  const page = await app.firstWindow();
  await checkNativeFlow(page, "Windows");
} finally {
  await app.close();
}
