import test from "node:test";
import assert from "node:assert/strict";
import {
  expiryFromDays,
  filterLicenses,
  makeKey,
  statusOf,
  type License,
} from "../src/models/domain";
import {
  addDemoApp,
  addDemoLicense,
  initialDemo,
  validateDemo,
} from "../src/services/demo";
import { checkConnection } from "../src/services/supabase";
import { validarLicencia } from "../sdk/cliente";

const date = Date.parse("2030-01-01T00:00:00Z");
const base: License = {
  id: "1",
  app_id: "pos",
  clave: "POS-1234567890ABCDEF",
  cliente: "Cliente",
  email_cliente: "",
  estado: "activa",
  fecha_expiracion: null,
  max_equipos: 1,
  created_at: new Date(date).toISOString(),
};
test("El vencimiento se calcula por instante y la revocación tiene prioridad", () => {
  assert.equal(statusOf(base, date), "activa");
  assert.equal(
    statusOf({ ...base, fecha_expiracion: new Date(date).toISOString() }, date),
    "expirada",
  );
  assert.equal(
    statusOf(
      { ...base, fecha_expiracion: new Date(date + 1).toISOString() },
      date,
    ),
    "activa",
  );
  assert.equal(
    statusOf(
      {
        ...base,
        estado: "revocada",
        fecha_expiracion: new Date(date - 100).toISOString(),
      },
      date,
    ),
    "revocada",
  );
  assert.equal(expiryFromDays(0, date), null);
  assert.equal(expiryFromDays(30, date), "2030-01-31T00:00:00.000Z");
});
test("Las claves llevan 128 bits aleatorios y el prefijo de la aplicación", () => {
  const keys = new Set(Array.from({ length: 1000 }, () => makeKey("POS")));
  assert.equal(keys.size, 1000);
  for (const key of keys)
    assert.match(key, /^POS-(?:[A-F0-9]{8}-){3}[A-F0-9]{8}$/);
});
test("El catálogo combina búsqueda, aplicación y estado", () => {
  const data = {
    ...initialDemo(),
    licenses: [
      base,
      {
        ...base,
        id: "2",
        app_id: "gestion",
        estado: "revocada" as const,
        cliente: "Otro",
      },
    ],
  };
  assert.equal(filterLicenses(data, "  cliente  ", "pos", "activa").length, 1);
  assert.equal(filterLicenses(data, "", "gestion", "revocada").length, 1);
  assert.equal(filterLicenses(data, "cliente", "gestion", "all").length, 0);
});
test("Una aplicación no puede registrarse dos veces; una clave importada queda asociada a su programa", () => {
  const data = initialDemo();
  assert.throws(() => addDemoApp(data, data.applications[0]), /ya está/);
  const input = {
    app_id: "pos",
    cliente: "Nuevo",
    email_cliente: "",
    max_equipos: 1,
    fecha_expiracion: null,
    clave: "POS-EXTERNAL-123456789",
  };
  const next = addDemoLicense(data, input);
  assert.throws(() => addDemoLicense(next, input), /ya está/);
  assert.equal(
    validateDemo(next, "gestion", input.clave, "hardware-0000000001").result
      .codigo,
    "NO_ENCONTRADA",
  );
});
test("Las validaciones repetidas conservan un cupo y un segundo equipo se rechaza", () => {
  const data = { ...initialDemo(), licenses: [base], activations: [] };
  const first = validateDemo(
    data,
    "punto-venta",
    base.clave,
    "hardware-0000000001",
  );
  assert.equal(first.result.valida, true);
  assert.equal(first.data.activations.length, 1);
  assert.equal(
    validateDemo(first.data, "punto-venta", base.clave, "hardware-0000000001")
      .data.activations.length,
    1,
  );
  assert.equal(
    validateDemo(first.data, "punto-venta", base.clave, "hardware-0000000002")
      .result.codigo,
    "LIMITE_EQUIPOS",
  );
  assert.equal(
    validateDemo(data, "punto-venta", base.clave, "short").result.codigo,
    "SOLICITUD_INVALIDA",
  );
});
test("El panel rechaza claves privadas y destinos fuera de Supabase", () => {
  const url = "https://project.supabase.co";
  assert.throws(
    () => checkConnection({ url, key: "sb_secret_private" }),
    /clave pública/,
  );
  const jwt = (role: string) => `x.${btoa(JSON.stringify({ role }))}.x`;
  assert.throws(
    () => checkConnection({ url, key: jwt("service_role") }),
    /clave pública/,
  );
  assert.doesNotThrow(() => checkConnection({ url, key: jwt("anon") }));
  assert.throws(() =>
    checkConnection({
      url: "https://project.supabase.co.attacker.com",
      key: jwt("anon"),
    }),
  );
  assert.throws(() =>
    checkConnection({ url: "http://project.supabase.co", key: jwt("anon") }),
  );
});
test("El SDK no autoriza el uso si hay un error de red o una respuesta malformada", async () => {
  const original = globalThis.fetch;
  const input = {
    supabaseUrl: "https://project.supabase.co",
    clavePublica: "public",
    codigoApp: "pos",
    licencia: base.clave,
    hardwareId: "hardware-0000000001",
  };
  try {
    globalThis.fetch = async () =>
      new Response('{"valida":"true"}', { status: 200 });
    await assert.rejects(validarLicencia(input), /inválida/);
    globalThis.fetch = async () => new Response("{}", { status: 401 });
    await assert.rejects(validarLicencia(input), /401/);
    globalThis.fetch = async () => {
      throw new TypeError("Network error");
    };
    await assert.rejects(validarLicencia(input), /Network error/);
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          valida: false,
          codigo: "REVOCADA",
          mensaje: "Revocada",
        }),
      );
    assert.equal((await validarLicencia(input)).valida, false);
  } finally {
    globalThis.fetch = original;
  }
});
