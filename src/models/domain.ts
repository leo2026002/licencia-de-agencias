export type Application = {
  id: string;
  nombre: string;
  codigo_app: string;
  prefijo: string;
  color: string;
  descripcion: string;
  created_at: string;
};
export type License = {
  id: string;
  app_id: string;
  clave: string;
  cliente: string;
  email_cliente: string;
  estado: "activa" | "revocada";
  fecha_expiracion: string | null;
  max_equipos: number;
  created_at: string;
};
export type Activation = {
  id: string;
  licencia_id: string;
  hardware_id: string;
  created_at: string;
  ultimo_acceso: string;
};
export type Data = {
  applications: Application[];
  licenses: License[];
  activations: Activation[];
};
export type LicenseStatus = "activa" | "expirada" | "revocada";
export type AppInput = Pick<
  Application,
  "nombre" | "codigo_app" | "prefijo" | "color" | "descripcion"
>;
export type LicenseInput = Pick<
  License,
  "app_id" | "cliente" | "email_cliente" | "fecha_expiracion" | "max_equipos"
> & { clave?: string };
export type ValidationResult = {
  valida: boolean;
  codigo: string;
  mensaje: string;
  fecha_expiracion?: string | null;
  licencia_id?: string;
};

export function statusOf(license: License, now = Date.now()): LicenseStatus {
  if (license.estado === "revocada") return "revocada";
  if (license.fecha_expiracion && Date.parse(license.fecha_expiracion) <= now)
    return "expirada";
  return "activa";
}
export function expiryFromDays(days: number, now = Date.now()): string | null {
  return days === 0 ? null : new Date(now + days * 86_400_000).toISOString();
}
export function makeKey(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${prefix}-${hex.match(/.{8}/g)!.join("-")}`;
}
export function filterLicenses(
  data: Data,
  query: string,
  app: string,
  status: string,
) {
  const needle = query.trim().toLocaleLowerCase("es");
  return data.licenses.filter(
    (l) =>
      (app === "all" || l.app_id === app) &&
      (status === "all" || statusOf(l) === status) &&
      [
        l.cliente,
        l.email_cliente,
        l.clave,
        data.applications.find((a) => a.id === l.app_id)?.nombre ?? "",
      ].some((v) => v.toLocaleLowerCase("es").includes(needle)),
  );
}
export function dateLabel(date: string | null): string {
  return date
    ? new Intl.DateTimeFormat("es-PE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(date))
    : "Sin vencimiento";
}
