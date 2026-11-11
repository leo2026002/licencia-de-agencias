import {
  expiryFromDays,
  makeKey,
  statusOf,
  type AppInput,
  type Data,
  type LicenseInput,
  type ValidationResult,
} from "../models/domain";

const STORAGE = "licencia-demo-v1";
export function initialDemo(): Data {
  const now = Date.now();
  const applications = [
    {
      id: "pos",
      nombre: "Punto de Venta",
      codigo_app: "punto-venta",
      prefijo: "POS",
      color: "#818CF8",
      descripcion: "Ventas, caja e inventario en un solo lugar.",
      created_at: new Date(now).toISOString(),
    },
    {
      id: "gestion",
      nombre: "Gestión Empresarial",
      codigo_app: "gestion",
      prefijo: "ERP",
      color: "#34D399",
      descripcion: "Control de operaciones para tu negocio.",
      created_at: new Date(now).toISOString(),
    },
    {
      id: "agenda",
      nombre: "Agenda Pro",
      codigo_app: "agenda-pro",
      prefijo: "AGD",
      color: "#FBBF24",
      descripcion: "Reservas y citas siempre organizadas.",
      created_at: new Date(now).toISOString(),
    },
  ];
  const clients = [
    "Comercial San Martín",
    "Distribuidora El Sol",
    "Consultorio Vida",
    "Bodega Las Palmeras",
    "Grupo Andino",
    "Estudio Creativo",
    "Farmacia Central",
    "Servicios del Pacífico",
  ];
  const licenses = clients.map((cliente, i) => ({
    id: `demo-${i}`,
    app_id: applications[i % 3].id,
    clave: makeKey(applications[i % 3].prefijo),
    cliente,
    email_cliente: `contacto${i + 1}@example.com`,
    estado: i === 5 ? ("revocada" as const) : ("activa" as const),
    fecha_expiracion:
      i === 2 || i === 6
        ? expiryFromDays(-3 - i, now)
        : i === 4
          ? null
          : expiryFromDays(12 + i * 9, now),
    max_equipos: (i % 2) + 1,
    created_at: new Date(now - i * 86_400_000 * 2).toISOString(),
  }));
  return {
    applications,
    licenses,
    activations: licenses
      .filter((l) => statusOf(l) === "activa")
      .map((l, i) => ({
        id: `act-${i}`,
        licencia_id: l.id,
        hardware_id: `equipo-demo-${String(i).padStart(8, "0")}`,
        created_at: l.created_at,
        ultimo_acceso: new Date(now).toISOString(),
      })),
  };
}
export function loadDemo(): Data {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (d?.applications && d?.licenses && d?.activations) return d;
  } catch {
    /* Nueva sesión de demostración. */
  }
  const data = initialDemo();
  saveDemo(data);
  return data;
}
export function saveDemo(data: Data) {
  localStorage.setItem(STORAGE, JSON.stringify(data));
}
export function addDemoApp(data: Data, input: AppInput): Data {
  if (data.applications.some((a) => a.codigo_app === input.codigo_app))
    throw new Error("El código de aplicación ya está registrado.");
  return {
    ...data,
    applications: [
      ...data.applications,
      {
        ...input,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      },
    ],
  };
}
export function addDemoLicense(data: Data, input: LicenseInput): Data {
  const app = data.applications.find((a) => a.id === input.app_id);
  if (!app) throw new Error("Selecciona una aplicación.");
  const clave = input.clave?.trim().toUpperCase() || makeKey(app.prefijo);
  if (data.licenses.some((l) => l.app_id === app.id && l.clave === clave))
    throw new Error("Esta clave ya está registrada para la aplicación.");
  return {
    ...data,
    licenses: [
      {
        ...input,
        clave,
        id: crypto.randomUUID(),
        estado: "activa",
        created_at: new Date().toISOString(),
      },
      ...data.licenses,
    ],
  };
}
export function validateDemo(
  data: Data,
  code: string,
  key: string,
  hardware: string,
): { data: Data; result: ValidationResult } {
  const fail = (codigo: string, mensaje: string) => ({
    data,
    result: { valida: false, codigo, mensaje },
  });
  if (hardware.trim().length < 16 || hardware.trim().length > 256)
    return fail(
      "SOLICITUD_INVALIDA",
      "El identificador del equipo debe tener entre 16 y 256 caracteres.",
    );
  const app = data.applications.find(
    (a) => a.codigo_app === code.trim().toLowerCase(),
  );
  const l = data.licenses.find(
    (l) => l.app_id === app?.id && l.clave === key.trim().toUpperCase(),
  );
  if (!l)
    return fail(
      "NO_ENCONTRADA",
      "La licencia no corresponde a esta aplicación.",
    );
  if (statusOf(l) === "revocada")
    return fail("REVOCADA", "Esta licencia fue revocada.");
  if (statusOf(l) === "expirada")
    return fail("EXPIRADA", "La licencia ha vencido.");
  const act = data.activations.find(
    (a) => a.licencia_id === l.id && a.hardware_id === hardware.trim(),
  );
  if (
    !act &&
    data.activations.filter((a) => a.licencia_id === l.id).length >=
      l.max_equipos
  )
    return fail(
      "LIMITE_EQUIPOS",
      "Se alcanzó el límite de equipos autorizados.",
    );
  const now = new Date().toISOString();
  const activations = act
    ? data.activations.map((a) =>
        a.id === act.id ? { ...a, ultimo_acceso: now } : a,
      )
    : [
        ...data.activations,
        {
          id: crypto.randomUUID(),
          licencia_id: l.id,
          hardware_id: hardware.trim(),
          created_at: now,
          ultimo_acceso: now,
        },
      ];
  return {
    data: { ...data, activations },
    result: {
      valida: true,
      codigo: "VALIDA",
      mensaje: "Equipo autorizado.",
      licencia_id: l.id,
      fecha_expiracion: l.fecha_expiracion,
    },
  };
}
