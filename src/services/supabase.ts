import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AppInput,
  Data,
  LicenseInput,
  ValidationResult,
} from "../models/domain";

export type Connection = { url: string; key: string };
const CONFIG_KEY = "licencia-supabase-public-v1";
export function readConnection(): Connection | null {
  try {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
    return config?.url && config?.key ? config : null;
  } catch {
    return null;
  }
}
export function saveConnection(config: Connection | null) {
  if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  else localStorage.removeItem(CONFIG_KEY);
}
export function checkConnection(config: Connection) {
  const url = new URL(config.url);
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error(
      "Usa la URL HTTPS de tu proyecto: https://tu-proyecto.supabase.co",
    );
  if (config.key.startsWith("sb_publishable_") && config.key.length > 25)
    return;
  try {
    const payload = JSON.parse(
      atob(config.key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (payload.role === "anon") return;
  } catch {
    /* Rechazar claves privadas o inválidas. */
  }
  throw new Error(
    "Usa la clave pública publishable o anon. Nunca uses service_role ni sb_secret.",
  );
}
export function connect(config: Connection): SupabaseClient {
  checkConnection(config);
  return createClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
export function friendlyError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e.code === "23505")
    return "Ese código o esa clave ya existe. Usa un valor diferente.";
  if (e.code === "42501")
    return "Tu usuario no tiene permisos de administrador.";
  if (e.code === "PGRST202" || e.code === "42P01")
    return "Falta instalar schema.sql en este proyecto de Supabase.";
  if (/fetch|network/i.test(e.message || ""))
    return "No se pudo conectar. Revisa tu conexión y la URL de Supabase.";
  if (e.message === "Invalid login credentials")
    return "El correo o la contraseña no son correctos.";
  return e.message || "No se pudo completar la operación.";
}
async function rpc(
  client: SupabaseClient,
  name: string,
  params?: Record<string, unknown>,
) {
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return data;
}
export async function fetchData(client: SupabaseClient): Promise<Data> {
  if (!(await rpc(client, "es_admin")))
    throw new Error(
      "Tu usuario no está autorizado. Regístralo en administradores desde SQL Editor.",
    );
  // Paginación explícita para no truncar el catálogo al límite de Supabase.
  async function allRows(table: string) {
    const rows: unknown[] = [];
    for (let start = 0; ; start += 500) {
      const result = await client
        .from(table)
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")
        .range(start, start + 499);
      if (result.error) throw result.error;
      rows.push(...result.data);
      if (result.data.length < 500) break;
    }
    return rows;
  }
  const [applications, licenses, activations] = await Promise.all([
    allRows("aplicaciones"),
    allRows("licencias"),
    allRows("activaciones"),
  ]);
  return { applications, licenses, activations } as Data;
}
export const api = {
  addApp: (c: SupabaseClient, a: AppInput) =>
    rpc(c, "registrar_aplicacion", {
      p_nombre: a.nombre,
      p_codigo_app: a.codigo_app,
      p_prefijo: a.prefijo,
      p_color: a.color,
      p_descripcion: a.descripcion,
    }),
  addLicense: (c: SupabaseClient, l: LicenseInput) =>
    rpc(c, "emitir_licencia", {
      p_app_id: l.app_id,
      p_cliente: l.cliente,
      p_email_cliente: l.email_cliente,
      p_fecha_expiracion: l.fecha_expiracion,
      p_max_equipos: l.max_equipos,
      p_clave: l.clave || null,
    }),
  changeStatus: (c: SupabaseClient, id: string, status: string) =>
    rpc(c, "cambiar_estado_licencia", { p_id: id, p_estado: status }),
  renew: (c: SupabaseClient, id: string, date: string | null) =>
    rpc(c, "renovar_licencia", { p_id: id, p_fecha_expiracion: date }),
  release: (c: SupabaseClient, id: string) =>
    rpc(c, "liberar_equipo", { p_id: id }),
  validate: (
    c: SupabaseClient,
    code: string,
    key: string,
    hw: string,
  ): Promise<ValidationResult> =>
    rpc(c, "validar_licencia", {
      p_codigo_app: code,
      p_clave: key,
      p_hardware_id: hw,
    }),
};
