-- Panel Administrador de Licencias de Software · PostgreSQL 15+ / Supabase
-- Ejecutar este archivo completo UNA VEZ en SQL Editor de un proyecto nuevo.
-- No elimina tablas ni datos. No es una migración para esquemas preexistentes.
begin;

create table public.administradores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.aplicaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(trim(nombre)) between 1 and 120),
  codigo_app text not null unique check (codigo_app ~ '^[a-z0-9][a-z0-9_-]{1,49}$'),
  prefijo text not null check (prefijo ~ '^[A-Z0-9]{2,10}$'),
  color text not null default '#6366F1' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  descripcion text not null default '' check (char_length(descripcion) <= 500),
  created_at timestamptz not null default now()
);
create table public.licencias (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.aplicaciones(id) on delete restrict,
  clave text not null check (char_length(clave) between 16 and 200 and clave = upper(trim(clave)) and clave ~ '^[A-Z0-9-]+$'),
  cliente text not null check (char_length(trim(cliente)) between 1 and 160),
  email_cliente text not null default '' check (char_length(email_cliente) <= 254),
  estado text not null default 'activa' check (estado in ('activa', 'revocada')),
  fecha_expiracion timestamptz,
  max_equipos integer not null default 1 check (max_equipos between 1 and 100),
  created_at timestamptz not null default now(),
  unique (app_id, clave)
);
create table public.activaciones (
  id uuid primary key default gen_random_uuid(),
  licencia_id uuid not null references public.licencias(id) on delete cascade,
  hardware_id text not null check (char_length(hardware_id) between 16 and 256),
  created_at timestamptz not null default now(),
  ultimo_acceso timestamptz not null default now(),
  unique (licencia_id, hardware_id)
);
create index licencias_created_idx on public.licencias(created_at desc);
create index licencias_expiracion_idx on public.licencias(fecha_expiracion) where estado = 'activa';

create function public.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.administradores where user_id = auth.uid());
$$;

alter table public.administradores enable row level security;
alter table public.aplicaciones enable row level security;
alter table public.licencias enable row level security;
alter table public.activaciones enable row level security;
-- Administradores se gestiona exclusivamente desde SQL Editor / rol de servidor.
create policy aplicaciones_admin on public.aplicaciones for select to authenticated using (public.es_admin());
create policy licencias_admin on public.licencias for select to authenticated using (public.es_admin());
create policy activaciones_admin on public.activaciones for select to authenticated using (public.es_admin());

create function public.registrar_aplicacion(
  p_nombre text, p_codigo_app text, p_prefijo text,
  p_color text default '#6366F1', p_descripcion text default ''
) returns public.aplicaciones
language plpgsql security definer set search_path = '' as $$
declare v_app public.aplicaciones;
begin
  if not public.es_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  insert into public.aplicaciones(nombre, codigo_app, prefijo, color, descripcion)
    values (trim(p_nombre), lower(trim(p_codigo_app)), upper(trim(p_prefijo)), p_color, trim(p_descripcion))
    returning * into v_app;
  return v_app;
end;
$$;

-- p_clave nulo: generar en el servidor. Con valor: importar un generador externo.
-- Nunca llamar esta RPC desde el programa distribuido al cliente.
create function public.emitir_licencia(
  p_app_id uuid, p_cliente text, p_fecha_expiracion timestamptz default null,
  p_max_equipos integer default 1, p_email_cliente text default '', p_clave text default null
) returns public.licencias
language plpgsql security definer set search_path = '' as $$
declare v_prefix text; v_hex text; v_clave text; v_license public.licencias;
begin
  if not public.es_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  select prefijo into v_prefix from public.aplicaciones where id = p_app_id;
  if not found then raise exception 'La aplicación no existe'; end if;
  if p_fecha_expiracion is not null and p_fecha_expiracion <= clock_timestamp() then
    raise exception 'El vencimiento debe estar en el futuro';
  end if;
  if p_clave is null then
    -- Dos UUID v4 (244 bits aleatorios) -> SHA-256 -> 128 bits en hexadecimal.
    v_hex := upper(substr(encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'), 1, 32));
    v_clave := v_prefix || '-' || substr(v_hex, 1, 8) || '-' || substr(v_hex, 9, 8) || '-' || substr(v_hex, 17, 8) || '-' || substr(v_hex, 25, 8);
  else
    v_clave := upper(trim(p_clave));
  end if;
  insert into public.licencias(app_id, clave, cliente, email_cliente, fecha_expiracion, max_equipos)
    values (p_app_id, v_clave, trim(p_cliente), trim(p_email_cliente), p_fecha_expiracion, p_max_equipos)
    returning * into v_license;
  return v_license;
end;
$$;

create function public.cambiar_estado_licencia(p_id uuid, p_estado text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  update public.licencias set estado = p_estado where id = p_id;
  if not found then raise exception 'La licencia no existe'; end if;
end;
$$;
create function public.renovar_licencia(p_id uuid, p_fecha_expiracion timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  if p_fecha_expiracion is not null and p_fecha_expiracion <= clock_timestamp() then
    raise exception 'El vencimiento debe estar en el futuro';
  end if;
  update public.licencias set fecha_expiracion = p_fecha_expiracion where id = p_id;
  if not found then raise exception 'La licencia no existe'; end if;
end;
$$;
create function public.liberar_equipo(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_licencia uuid;
begin
  if not public.es_admin() then raise exception 'Acceso denegado' using errcode = '42501'; end if;
  select licencia_id into v_licencia from public.activaciones where id = p_id;
  if not found then raise exception 'La activación no existe'; end if;
  perform 1 from public.licencias where id = v_licencia for update;
  delete from public.activaciones where id = p_id;
end;
$$;

-- Disponible a clientes con publishable/anon key. Ningún dato personal en la respuesta.
-- La primera validación válida registra el equipo automáticamente.
create function public.validar_licencia(p_codigo_app text, p_clave text, p_hardware_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_license public.licencias; v_act_id uuid; v_now timestamptz;
begin
  if p_codigo_app is null or char_length(p_codigo_app) > 50 or
     p_clave is null or char_length(p_clave) not between 16 and 200 or
     p_hardware_id is null or char_length(trim(p_hardware_id)) not between 16 and 256 then
    return jsonb_build_object('valida', false, 'codigo', 'SOLICITUD_INVALIDA', 'mensaje', 'Revisa los datos de validación.');
  end if;
  -- El bloqueo de fila serializa activaciones simultáneas para esta licencia.
  select l.* into v_license from public.licencias l
    join public.aplicaciones a on a.id = l.app_id
    where a.codigo_app = lower(trim(p_codigo_app)) and l.clave = upper(trim(p_clave))
    for update of l;
  if not found then
    return jsonb_build_object('valida', false, 'codigo', 'NO_ENCONTRADA', 'mensaje', 'La licencia no corresponde a esta aplicación.');
  end if;
  v_now := clock_timestamp();
  if v_license.estado = 'revocada' then
    return jsonb_build_object('valida', false, 'codigo', 'REVOCADA', 'mensaje', 'Esta licencia fue revocada.');
  end if;
  if v_license.fecha_expiracion is not null and v_license.fecha_expiracion <= v_now then
    return jsonb_build_object('valida', false, 'codigo', 'EXPIRADA', 'mensaje', 'La licencia ha vencido.');
  end if;
  select id into v_act_id from public.activaciones
    where licencia_id = v_license.id and hardware_id = trim(p_hardware_id);
  if v_act_id is not null then
    update public.activaciones set ultimo_acceso = v_now where id = v_act_id;
  else
    if (select count(*) from public.activaciones where licencia_id = v_license.id) >= v_license.max_equipos then
      return jsonb_build_object('valida', false, 'codigo', 'LIMITE_EQUIPOS', 'mensaje', 'Se alcanzó el límite de equipos autorizados.');
    end if;
    insert into public.activaciones(licencia_id, hardware_id, ultimo_acceso)
      values (v_license.id, trim(p_hardware_id), v_now);
  end if;
  return jsonb_build_object('valida', true, 'codigo', 'VALIDA', 'mensaje', 'Equipo autorizado.',
    'licencia_id', v_license.id, 'fecha_expiracion', v_license.fecha_expiracion);
end;
$$;

-- Revocar los permisos implícitos; exponer únicamente operaciones deliberadas.
revoke all on public.administradores, public.aplicaciones, public.licencias, public.activaciones from public, anon, authenticated;
grant select on public.aplicaciones, public.licencias, public.activaciones to authenticated;
revoke all on function public.es_admin() from public, anon;
revoke all on function public.registrar_aplicacion(text,text,text,text,text) from public, anon;
revoke all on function public.emitir_licencia(uuid,text,timestamptz,integer,text,text) from public, anon;
revoke all on function public.cambiar_estado_licencia(uuid,text) from public, anon;
revoke all on function public.renovar_licencia(uuid,timestamptz) from public, anon;
revoke all on function public.liberar_equipo(uuid) from public, anon;
revoke all on function public.validar_licencia(text,text,text) from public;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.registrar_aplicacion(text,text,text,text,text) to authenticated;
grant execute on function public.emitir_licencia(uuid,text,timestamptz,integer,text,text) to authenticated;
grant execute on function public.cambiar_estado_licencia(uuid,text) to authenticated;
grant execute on function public.renovar_licencia(uuid,timestamptz) to authenticated;
grant execute on function public.liberar_equipo(uuid) to authenticated;
grant execute on function public.validar_licencia(text,text,text) to anon, authenticated;
commit;

-- SEGUNDO PASO: crear tu usuario en Authentication > Users > Add user.
-- Después ejecutar (cambiar solamente el correo) para autorizarlo:
-- insert into public.administradores(user_id)
-- select id from auth.users where lower(email) = lower('TU_CORREO')
-- on conflict do nothing;
