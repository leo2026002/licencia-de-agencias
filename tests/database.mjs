// Ejecuta el schema real en PostgreSQL WASM. Emula solo auth.uid() y auth.users.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PGlite();
let assertions = 0;
function eq(actual, expected) {
  assert.deepEqual(actual, expected);
  assertions++;
}
async function denies(query, params) {
  await assert.rejects(
    db.query(query, params),
    /permission denied|Acceso denegado/i,
  );
  assertions++;
}
const admin = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
async function role(name, id = "") {
  await db.exec(`reset role; set role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function value(sql, params = []) {
  return (
    await db.query("select to_jsonb(v) as v from (" + sql + ") result", params)
  ).rows[0].v;
}
async function validate(app, key, hardware) {
  return value("select public.validar_licencia($1,$2,$3) as v", [
    app,
    key,
    hardware,
  ]);
}
try {
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create publication supabase_realtime;`);
  await db.query("insert into auth.users values ($1, $2), ($3,$4)", [
    admin,
    "admin@example.com",
    other,
    "other@example.com",
  ]);
  await db.exec(
    await readFile(new URL("../schema.sql", import.meta.url), "utf8"),
  );
  eq((await db.query("select * from pg_publication_tables where pubname='supabase_realtime'")).rows.length, 3);
  await db.exec(await readFile(new URL('../supabase/migrations/0002_sincronizacion.sql', import.meta.url), 'utf8'));
  eq((await db.query("select * from pg_publication_tables where pubname='supabase_realtime'")).rows.length, 3);
  await db.query("insert into public.administradores(user_id) values ($1)", [
    admin,
  ]);
  await role("authenticated", admin);
  eq(await value("select public.es_admin() as v"), true);
  const app = await value(
    "select public.registrar_aplicacion('Punto de venta','pos','POS') as v",
  );
  const app2 = await value(
    "select public.registrar_aplicacion('Agenda','agenda','AGD') as v",
  );
  const license = await value(
    "select public.emitir_licencia($1,'Cliente') as v",
    [app.id],
  );
  assert.match(license.clave, /^POS-(?:[A-F0-9]{8}-){3}[A-F0-9]{8}$/);
  assertions++;
  eq((await db.query("select * from public.licencias")).rows.length, 1);
  await denies(
    "insert into public.licencias(app_id, clave, cliente) values ($1,$2,$3)",
    [app.id, "POS-BYPASS-12345678", "Bypass"],
  );
  await role("authenticated", other);
  eq(await value("select public.es_admin() as v"), false);
  eq((await db.query("select * from public.licencias")).rows.length, 0);
  eq((await db.query("select * from public.aplicaciones")).rows.length, 0);
  await denies("select public.registrar_aplicacion('No','no','NO')");
  await denies("select public.emitir_licencia($1,'No')", [app.id]);
  await denies("select public.cambiar_estado_licencia($1,'revocada')", [
    license.id,
  ]);
  await denies("select * from public.administradores");
  await role("anon");
  await denies("select * from public.licencias");
  await denies("select public.emitir_licencia($1,'No')", [app.id]);
  await denies("select public.renovar_licencia($1,null)", [license.id]);
  eq(
    (await validate("pos", license.clave, "short")).codigo,
    "SOLICITUD_INVALIDA",
  );
  eq(
    (await validate("pos", null, "hardware-000000001")).codigo,
    "SOLICITUD_INVALIDA",
  );
  eq(
    (await validate(app2.codigo_app, license.clave, "hardware-000000001"))
      .codigo,
    "NO_ENCONTRADA",
  );
  eq((await validate("pos", license.clave, "hardware-000000001")).valida, true);
  eq((await validate("pos", license.clave, "hardware-000000001")).valida, true);
  eq(
    (await validate("pos", license.clave, "hardware-000000002")).codigo,
    "LIMITE_EQUIPOS",
  );
  const publicResult = await validate(
    "pos",
    license.clave,
    "hardware-000000001",
  );
  eq("cliente" in publicResult, false);
  eq("clave" in publicResult, false);
  await role("authenticated", admin);
  const activation = (await db.query("select * from public.activaciones"))
    .rows[0];
  eq((await db.query("select * from public.activaciones")).rows.length, 1);
  await db.query("select public.liberar_equipo($1)", [activation.id]);
  await role("anon");
  eq((await validate("pos", license.clave, "hardware-000000002")).valida, true);
  await role("authenticated", admin);
  await db.query("select public.cambiar_estado_licencia($1,'revocada')", [
    license.id,
  ]);
  await role("anon");
  eq(
    (await validate("pos", license.clave, "hardware-000000002")).codigo,
    "REVOCADA",
  );
  await role("authenticated", admin);
  await db.query(
    "select public.renovar_licencia($1,now() + interval '30 days')",
    [license.id],
  );
  eq(
    await value("select estado as v from public.licencias where id=$1", [
      license.id,
    ]),
    "revocada",
  );
  await db.query("select public.cambiar_estado_licencia($1,'activa')", [
    license.id,
  ]);
  await role("anon");
  eq((await validate("pos", license.clave, "hardware-000000002")).valida, true);
  await role("postgres");
  await db.query(
    "update public.licencias set fecha_expiracion=now()-interval '1 second' where id=$1",
    [license.id],
  );
  await role("anon");
  eq(
    (await validate("pos", license.clave, "hardware-000000002")).codigo,
    "EXPIRADA",
  );
  await role("authenticated", admin);
  const imported = await value(
    "select public.emitir_licencia($1,'Externa',null,2,'','EXTERNAL-1234567890') as v",
    [app.id],
  );
  eq(imported.clave, "EXTERNAL-1234567890");
  await assert.rejects(
    db.query(
      "select public.emitir_licencia($1,'Repetida',null,1,'','EXTERNAL-1234567890')",
      [app.id],
    ),
    /duplicate key/,
  );
  assertions++;
  await assert.rejects(
    db.query(
      "select public.emitir_licencia($1,'Pasado',now()-interval '1 day')",
      [app.id],
    ),
    /futuro/,
  );
  assertions++;
  await role("anon");
  const attempts = await Promise.all(
    [1, 2, 3, 4].map((i) =>
      validate("pos", imported.clave, `parallel-hardware-${i}`),
    ),
  );
  eq(attempts.filter((r) => r.valida).length, 2);
  eq(attempts.filter((r) => r.codigo === "LIMITE_EQUIPOS").length, 2);
  // PGlite serializa las consultas; esto verifica cupos, no concurrencia entre conexiones.
  console.log(
    `SQL verificado: ${assertions} comprobaciones de permisos, claves, activaciones, vencimiento y revocación.`,
  );
} catch (error) {
  console.error(error.message, error.query || "", error.params || "");
  process.exitCode = 1;
} finally {
  await db.close();
}
