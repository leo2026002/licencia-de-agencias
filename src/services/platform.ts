import { Capacitor } from "@capacitor/core";

export async function copyText(text: string) {
  if (Capacitor.isNativePlatform()) {
    const { Clipboard } = await import("@capacitor/clipboard");
    await Clipboard.write({ string: text });
  } else await navigator.clipboard.writeText(text);
}

export async function saveCsv(content: string, filename: string) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } =
      await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const saved = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: "Catálogo de licencias",
      url: saved.uri,
      dialogTitle: "Guardar o compartir catálogo",
    });
    return;
  }
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function observeNativeLifecycle(
  onBack: () => void,
): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  const { App } = await import("@capacitor/app");
  const resumed = await App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event("focus"));
  });
  const back = await App.addListener("backButton", onBack);
  return () => {
    void resumed.remove();
    void back.remove();
  };
}
