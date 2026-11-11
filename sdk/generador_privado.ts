import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Solo para TU herramienta privada de generación, con una sesión administradora.
 * No incorporar las credenciales administrativas en el programa del cliente.
 * Supabase comprueba los permisos en el servidor en cada llamada.
 */
export async function registrarClaveExterna(client: SupabaseClient, input: {
  codigoApp: string;
  clave: string;
  cliente: string;
  emailCliente?: string;
  fechaExpiracion: string | null;
  maxEquipos: number;
}) {
  const app = await client.from('aplicaciones').select('id')
    .eq('codigo_app', input.codigoApp.trim().toLowerCase()).single();
  if (app.error || !app.data) throw new Error('No se encontró la aplicación o la sesión no tiene permiso para consultarla.');
  const result = await client.rpc('emitir_licencia', {
    p_app_id: app.data.id,
    p_cliente: input.cliente,
    p_email_cliente: input.emailCliente || '',
    p_fecha_expiracion: input.fechaExpiracion,
    p_max_equipos: input.maxEquipos,
    p_clave: input.clave,
  });
  if (result.error) throw result.error;
  return result.data;
}
