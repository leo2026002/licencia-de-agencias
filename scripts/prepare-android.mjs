import { existsSync } from "node:fs";
import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

function cap(args) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/@capacitor/cli/bin/capacitor", ...args],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!existsSync("android/app/build.gradle")) cap(["add", "android"]);
cap(["sync", "android"]);
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const gradlePath = "android/app/build.gradle";
let gradle = await readFile(gradlePath, "utf8");
gradle = gradle
  .replace(/versionCode\s+\d+/, "versionCode 110")
  .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
await writeFile(gradlePath, gradle);
const manifest = "android/app/src/main/AndroidManifest.xml";
await writeFile(
  manifest,
  (await readFile(manifest, "utf8")).replace(
    'android:allowBackup="true"',
    'android:allowBackup="false"',
  ),
);
for (const [density, size] of Object.entries({
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
})) {
  const folder = `android/app/src/main/res/mipmap-${density}`;
  await mkdir(folder, { recursive: true });
  for (const name of [
    "ic_launcher.png",
    "ic_launcher_round.png",
    "ic_launcher_foreground.png",
  ])
    await copyFile(`desktop/icon-${size}.png`, `${folder}/${name}`);
}
console.log(`Proyecto Android ${version} preparado.`);
