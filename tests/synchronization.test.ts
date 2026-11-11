import test, { after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { JSDOM } from "jsdom";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Data } from "../src/models/domain";
import {
  synchronizeCatalog,
  type SyncStatus,
} from "../src/services/synchronization";

const dom = new JSDOM("", { url: "https://localhost" });
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
}))
  Object.defineProperty(globalThis, key, { value, configurable: true });
after(() => dom.window.close());
const empty: Data = { applications: [], licenses: [], activations: [] };
function transport() {
  const handlers: (() => void)[] = [];
  let removed = 0;
  const channel = {
    on(_event: string, _filter: unknown, callback: () => void) {
      handlers.push(callback);
      return channel;
    },
    subscribe(callback: (status: string) => void) {
      callback("SUBSCRIBED");
      return channel;
    },
  };
  const client = {
    channel: () => channel,
    removeChannel: async () => {
      removed++;
    },
  } as unknown as SupabaseClient;
  return {
    client,
    change: () => handlers.forEach((h) => h()),
    removed: () => removed,
  };
}
test("Dos dispositivos reciben el catálogo central y un cambio remoto automáticamente", async () => {
  const first = transport(),
    second = transport();
  let central = empty;
  let a: Data | undefined, b: Data | undefined;
  const one = synchronizeCatalog(
    first.client,
    (d) => {
      a = d;
    },
    () => {},
    (e) => {
      throw e;
    },
    async () => central,
  );
  const two = synchronizeCatalog(
    second.client,
    (d) => {
      b = d;
    },
    () => {},
    (e) => {
      throw e;
    },
    async () => central,
  );
  try {
    await Promise.all([one.refresh(), two.refresh()]);
    assert.equal(a, central);
    assert.equal(b, central);
    central = {
      ...empty,
      applications: [
        {
          id: "1",
          nombre: "Nuevo",
          codigo_app: "nuevo",
          prefijo: "NV",
          descripcion: "",
          color: "#6366F1",
          created_at: new Date().toISOString(),
        },
      ],
    };
    first.change();
    second.change();
    await pause(260);
    assert.equal(a, central);
    assert.equal(b, central);
  } finally {
    one.stop();
    two.stop();
  }
  assert.equal(first.removed(), 1);
  assert.equal(second.removed(), 1);
});
test("Las lecturas se serializan y no se publican resultados después de cerrar sesión", async () => {
  const mock = transport();
  const received: Data[] = [];
  const states: SyncStatus[] = [];
  let resolveFirst: (value: Data) => void = () => {};
  let calls = 0;
  const newer = { ...empty, applications: [] };
  const sync = synchronizeCatalog(
    mock.client,
    (d) => received.push(d),
    (s) => states.push(s),
    (e) => {
      throw e;
    },
    async () => {
      calls++;
      if (calls === 1)
        return new Promise<Data>((resolve) => {
          resolveFirst = resolve;
        });
      return newer;
    },
  );
  try {
    const pending = sync.refresh();
    await sync.refresh();
    assert.equal(calls, 1);
    resolveFirst(empty);
    await pending;
    assert.equal(calls, 2);
    assert.equal(received.at(-1), newer);
    assert.equal(states.at(-1), "synced");
    sync.stop();
    await sync.refresh();
    mock.change();
    await pause(260);
    assert.equal(calls, 2);
  } finally {
    sync.stop();
  }
});
test("Perder la red muestra desconexión y recuperarla vuelve a sincronizar", async () => {
  const mock = transport();
  let calls = 0;
  const states: SyncStatus[] = [];
  Object.defineProperty(navigator, "onLine", {
    value: false,
    configurable: true,
  });
  const sync = synchronizeCatalog(
    mock.client,
    () => {},
    (s) => states.push(s),
    (e) => {
      throw e;
    },
    async () => {
      calls++;
      return empty;
    },
  );
  try {
    await sync.refresh();
    assert.equal(calls, 0);
    assert.equal(states.at(-1), "offline");
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    window.dispatchEvent(new dom.window.Event("online"));
    await pause(260);
    assert.equal(calls, 1);
    assert.equal(states.at(-1), "synced");
  } finally {
    sync.stop();
  }
});
