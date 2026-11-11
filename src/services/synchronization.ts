import type { SupabaseClient } from "@supabase/supabase-js";
import type { Data } from "../models/domain";
import { fetchData } from "./supabase";

export type SyncStatus =
  "connecting" | "synced" | "updating" | "offline" | "error";

/** Un único lector en vuelo evita que respuestas antiguas sobreescriban cambios nuevos. */
export function synchronizeCatalog(
  client: SupabaseClient,
  onData: (data: Data) => void,
  onStatus: (status: SyncStatus) => void,
  onError: (error: unknown) => void,
  load: () => Promise<Data> = () => fetchData(client),
) {
  let stopped = false;
  let running = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function refresh() {
    if (stopped) return;
    if (!navigator.onLine) {
      onStatus("offline");
      return;
    }
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    onStatus("updating");
    try {
      do {
        dirty = false;
        const data = await load();
        if (stopped) return;
        onData(data);
      } while (dirty && !stopped);
      if (!stopped) onStatus("synced");
    } catch (error) {
      if (!stopped) {
        onStatus(navigator.onLine ? "error" : "offline");
        onError(error);
      }
    } finally {
      running = false;
    }
  }
  function schedule() {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void refresh();
    }, 200);
  }
  onStatus(navigator.onLine ? "connecting" : "offline");
  const channel = client.channel(`catalogo-${crypto.randomUUID()}`);
  for (const table of ["aplicaciones", "licencias", "activaciones"]) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      schedule,
    );
  }
  channel.subscribe((status) => {
    if (stopped) return;
    if (status === "SUBSCRIBED") schedule();
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") schedule();
  });
  function foreground() {
    if (document.visibilityState !== "hidden") schedule();
  }
  function offline() {
    onStatus("offline");
  }
  // Respaldo si Realtime aún no está habilitado en un proyecto existente.
  const polling = setInterval(foreground, 30_000);
  window.addEventListener("online", schedule);
  window.addEventListener("offline", offline);
  window.addEventListener("focus", foreground);
  document.addEventListener("visibilitychange", foreground);
  schedule();
  return {
    refresh,
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      clearInterval(polling);
      window.removeEventListener("online", schedule);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", foreground);
      document.removeEventListener("visibilitychange", foreground);
      void client.removeChannel(channel);
    },
  };
}
