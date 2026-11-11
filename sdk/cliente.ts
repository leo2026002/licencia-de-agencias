/** Integración para los programas que venderás. Solo lleva la clave PÚBLICA. */
export type ResultadoLicencia = {
  valida: boolean;
  codigo:
    | "VALIDA"
    | "EXPIRADA"
    | "REVOCADA"
    | "LIMITE_EQUIPOS"
    | "NO_ENCONTRADA"
    | "SOLICITUD_INVALIDA";
  mensaje: string;
  licencia_id?: string;
  fecha_expiracion?: string | null;
};

export async function validarLicencia(input: {
  supabaseUrl: string;
  clavePublica: string;
  codigoApp: string;
  licencia: string;
  hardwareId: string;
  signal?: AbortSignal;
}): Promise<ResultadoLicencia> {
  const response = await fetch(
    `${input.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/validar_licencia`,
    {
      method: "POST",
      headers: {
        apikey: input.clavePublica,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_codigo_app: input.codigoApp,
        p_clave: input.licencia.trim(),
        p_hardware_id: input.hardwareId,
      }),
      signal: input.signal
        ? AbortSignal.any([input.signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok)
    throw new Error(
      `No se pudo comprobar la licencia (HTTP ${response.status}).`,
    );
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !("valida" in result) ||
    typeof result.valida !== "boolean" ||
    !("codigo" in result) ||
    typeof result.codigo !== "string" ||
    !("mensaje" in result) ||
    typeof result.mensaje !== "string"
  ) {
    throw new Error("El servidor devolvió una respuesta de licencia inválida.");
  }
  return result as ResultadoLicencia;
}
