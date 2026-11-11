import test, { afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// DOM simulado: permite probar flujos sin navegador ni servicio externo.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:4173",
});
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle,
  localStorage: dom.window.localStorage,
  FormData: dom.window.FormData,
})) {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import("react");
const { render, screen, within, cleanup } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { default: App } = await import("../src/views/App");
afterEach(() => cleanup());
after(() => dom.window.close());

test("Un administrador puede registrar un programa, emitir una licencia y revocarla", async () => {
  localStorage.clear();
  const user = userEvent.setup();
  render(<App />);
  assert.ok(
    screen.getByRole("heading", { name: "Tu software, bajo control." }),
  );
  await user.click(screen.getByRole("button", { name: /^Aplicaciones$/ }));
  await user.click(screen.getByRole("button", { name: "Nueva aplicación" }));
  let dialog = screen.getByRole("dialog");
  await user.type(
    within(dialog).getByLabelText("Nombre del programa"),
    "Programa de prueba",
  );
  await user.type(
    within(dialog).getByLabelText(/^Código de aplicación/),
    "prueba-app",
  );
  await user.type(
    within(dialog).getByLabelText(/^Prefijo de las claves/),
    "TST",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Registrar aplicación" }),
  );
  assert.ok(await screen.findByRole("heading", { name: "Programa de prueba" }));
  await user.click(screen.getByRole("button", { name: /^Licencias/ }));
  await user.click(screen.getByRole("button", { name: "Nueva licencia" }));
  dialog = screen.getByRole("dialog");
  const choices = within(dialog).getByLabelText("Aplicación");
  const option = within(choices).getByRole("option", {
    name: "Programa de prueba · TST",
  }) as HTMLOptionElement;
  await user.selectOptions(choices, option.value);
  await user.type(
    within(dialog).getByLabelText("Nombre del cliente"),
    "Cliente de prueba",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Crear licencia" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Cliente de prueba" }),
  );
  dialog = screen.getByRole("dialog");
  const key = within(dialog).getByLabelText(
    "Clave de licencia",
  ) as HTMLInputElement;
  assert.match(key.value, /^TST-(?:[A-F0-9]{8}-){3}[A-F0-9]{8}$/);
  await user.click(
    within(dialog).getByRole("button", { name: "Revocar licencia" }),
  );
  assert.ok(await within(dialog).findByText("Revocada"));
  await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
  await user.type(
    screen.getByRole("textbox", { name: "Buscar licencias" }),
    "Cliente de prueba",
  );
  assert.equal(screen.getAllByRole("row").length, 2);
  cleanup();
});

test("La importación registra claves propias y la validación aplica el límite de equipos", async () => {
  localStorage.clear();
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Nueva licencia" }));
  let dialog = screen.getByRole("dialog");
  await user.type(
    within(dialog).getByLabelText("Nombre del cliente"),
    "Cliente externo",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Importar clave" }),
  );
  await user.type(
    within(dialog).getByLabelText(/^Clave de tu generador/),
    "EXTERNAL-1234567890",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Registrar licencia" }),
  );
  await screen.findByRole("status");
  await user.click(screen.getByRole("button", { name: "Equipos" }));
  await user.click(screen.getByRole("button", { name: "Probar validación" }));
  dialog = screen.getByRole("dialog");
  await user.type(
    within(dialog).getByLabelText("Clave de licencia"),
    "EXTERNAL-1234567890",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Validar y autorizar equipo" }),
  );
  assert.ok(await within(dialog).findByText("VALIDA"));
  const hardware = within(dialog).getByLabelText(
    /^Identificador estable del equipo/,
  );
  await user.clear(hardware);
  await user.type(hardware, "segundo-equipo-0000001");
  await user.click(
    within(dialog).getByRole("button", { name: "Validar y autorizar equipo" }),
  );
  assert.ok(await within(dialog).findByText("LIMITE_EQUIPOS"));
  cleanup();
});

test("La configuración rechaza claves privadas sin intentar conectarlas", async () => {
  localStorage.clear();
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    screen.getByRole("button", { name: "Configuración", exact: true }),
  );
  await user.type(
    screen.getByLabelText("URL del proyecto"),
    "https://project.supabase.co",
  );
  await user.type(
    screen.getByLabelText(/^Clave pública/),
    "sb_secret_no_debe_utilizarse",
  );
  await user.click(
    screen.getByRole("button", { name: "Conectar mi proyecto" }),
  );
  assert.match(
    (await screen.findByRole("alert")).textContent || "",
    /Nunca uses service_role/,
  );
  assert.equal(localStorage.getItem("licencia-supabase-public-v1"), null);
  cleanup();
});
