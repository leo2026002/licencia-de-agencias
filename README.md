# Panel Administrador de Licencias de Software

Panel en español para vender y administrar licencias de varios programas. Incluye un dashboard oscuro, aplicaciones dinámicas, generación e importación de claves, catálogo con búsqueda y exportación CSV, renovación, revocación y control de equipos.

**Estado:** código funcional con demostración local. Para emitir licencias reales hay que instalar el esquema y conectar un proyecto propio de Supabase. No incluye cobros automáticos, facturación ni un instalador ejecutable nativo.

## Abrir el programa sin programar

1. Descarga y descomprime el paquete **panel-licencias-listo.zip**. Conserva todas sus carpetas.
2. Instala **Node.js LTS 22 o superior**, si todavía no lo tienes: https://nodejs.org.
3. En Windows, abre **INICIAR-WINDOWS.bat** con doble clic. En macOS o Linux, ejecuta **INICIAR-MAC-LINUX.sh**. El panel abre el navegador en `http://127.0.0.1:4173`.
4. Mantén abierta la ventana que inicia el programa. Para cerrarlo, pulsa Ctrl+C en esa ventana.

El paquete listo incluye `dist/` compilado; no necesitas instalar dependencias ni editar código para probarlo. El ZIP de código que genera GitHub no incluye `dist/`: usa el paquete listo o descarga **panel-compilado** desde una ejecución exitosa de Actions → Verificar panel.

La primera apertura usa datos ficticios guardados en este navegador. Las claves de demostración **no sirven** en tus programas. El modo real tiene un catálogo separado en Supabase. La configuración y la sesión se conservan en el navegador del administrador; utiliza un equipo de confianza.

## Conectar Supabase

La URL y la clave pública permiten al panel conectarse. No tienen permisos para instalar tablas o crear administradores: esos dos pasos requieren tu acceso al dashboard de Supabase.

1. Crea un proyecto de Supabase. Usa un proyecto nuevo para este sistema.
2. En **SQL Editor**, ejecuta el archivo completo **schema.sql** que viene incluido. El archivo no elimina datos. Está diseñado para instalarse una vez en un esquema nuevo.
3. En **Authentication → Users → Add user**, crea tu cuenta con correo y contraseña y confirma el correo desde el dashboard si corresponde. Desactiva el registro público si no lo necesitas.
4. Autoriza ese usuario ejecutando la instrucción comentada al final de **schema.sql**, con el correo de la cuenta creada. Este paso es necesario: iniciar sesión no convierte automáticamente al usuario en administrador.
5. Abre **Configuración** en el panel. Introduce **Project URL** y la clave **publishable** (o la clave antigua **anon**) de **Project Settings → API Keys**.
6. Inicia sesión con la cuenta administradora. Registra tu primera aplicación y emite una licencia.

El panel acepta los dominios estándar `https://<proyecto>.supabase.co`. No introduzcas `service_role`, `sb_secret_…` ni la contraseña de la base de datos. No se necesita una clave privada en el navegador.

Si falla una operación ya guardada al refrescar el catálogo, el panel lo indica: pulsa **Actualizar** antes de repetir la creación.

## Cómo se relacionan tus programas y el panel

Cada programa tiene su propio **codigo_app** y su prefijo. Una licencia de Punto de Venta no valida en Agenda Pro aunque alguien copie la clave. No tienes que modificar el panel cuando agregas otro programa.

Hay dos formas de emitir:

- **Generar clave:** Supabase genera una clave aleatoria de 128 bits con el prefijo de la aplicación. La demostración usa Web Crypto.
- **Importar clave:** registra una clave de tu generador externo, asociada a un programa, cliente, vigencia y límite de equipos. Las claves se normalizan a mayúsculas, admiten letras, números y guiones, y deben medir entre 16 y 200 caracteres. No es un validador genérico de claves de otros proveedores: las claves externas deben registrarse para poder validarse.

El generador externo debe estar bajo tu control. Si quieres que registre automáticamente las ventas, la integración administrativa puede llamar `emitir_licencia` con `p_clave`, usando una sesión administradora **en tu herramienta privada**. Los programas que entregas a los clientes solo llaman a `validar_licencia`.

Los ejecutables que crearás aún deben integrar esa llamada; el panel no puede añadir protección por sí solo a programas que no se han desarrollado. Incluimos clientes de referencia en **sdk/cliente.ts** y **sdk/cliente_python.py** para incorporarlos durante su desarrollo.

## Contrato de validación para integrar cada programa

Petición `POST https://<proyecto>.supabase.co/rest/v1/rpc/validar_licencia`.

Header `apikey`: clave pública publishable o anon. Header `Content-Type`: `application/json`.

| Parámetro JSON  | Valor                                                       |
| --------------- | ----------------------------------------------------------- |
| `p_codigo_app`  | Código registrado del programa                              |
| `p_clave`       | Clave completa del cliente                                  |
| `p_hardware_id` | Identificador estable del equipo, entre 16 y 256 caracteres |

Respuesta: `valida` (booleano), `codigo` y `mensaje`. Cuando es válida incluye `licencia_id` y `fecha_expiracion` (null para vigencia ilimitada). No devuelve nombre, correo ni clave del cliente.

| Código               | Significado                                  |
| -------------------- | -------------------------------------------- |
| `VALIDA`             | El equipo está autorizado                    |
| `NO_ENCONTRADA`      | La clave no corresponde al programa          |
| `EXPIRADA`           | Terminó la vigencia                          |
| `REVOCADA`           | El administrador bloqueó la licencia         |
| `LIMITE_EQUIPOS`     | No quedan cupos para un equipo nuevo         |
| `SOLICITUD_INVALIDA` | Faltan datos o tienen longitudes incorrectas |

La primera validación registra el equipo. Las siguientes actualizan su último acceso sin consumir más cupos. Un bloqueo de fila en la licencia serializa las activaciones para respetar el máximo incluso cuando llegan peticiones simultáneas.

Cada programa debe comprobar al arrancar y volver a comprobar periódicamente, por ejemplo cada 15 minutos. Una revocación surte efecto en la siguiente comprobación. Una respuesta de red fallida **no equivale** a una licencia válida. Esta versión requiere conexión; no implementa licencias offline firmadas ni un período de gracia.

El identificador del equipo debe elegirse al integrar la aplicación: en escritorio puede ser una huella SHA-256 de identificadores estables del sistema. Un UUID guardado localmente identifica una instalación, no demuestra la identidad física del dispositivo. No generes uno nuevo en cada arranque. El servidor comprueba el identificador recibido; no implementa atestación de hardware y un cliente modificado puede falsificarlo. La protección local también debe integrarse en cada programa.

Liberar un equipo borra la vinculación y deja un cupo libre. El equipo antiguo puede volver a registrarse si conserva una clave vigente y queda cupo. Para bloquear por completo una clave, revócala y emite otra. Renovar cambia el vencimiento desde hoy; no restaura automáticamente una licencia revocada.

## Datos y seguridad implementados

- **Supabase es el único backend externo**: Postgres, Auth y API RPC. La app no usa otra base de datos ni servicios de terceros. Las dependencias se descargan solo durante el desarrollo/compilación.
- RLS activo en las cuatro tablas. Solo usuarios de `administradores` pueden consultar aplicaciones, licencias y equipos. La lista de administradores se gestiona desde SQL/servidor.
- Las escrituras administrativas pasan por funciones que comprueban `auth.uid()`. No se permiten escrituras directas desde el navegador.
- Las funciones `SECURITY DEFINER` fijan un `search_path` vacío y referencias explícitas para evitar suplantación de objetos.
- Claves con alta entropía generadas en servidor, unicidad por aplicación y fechas `timestamptz`. Las claves completas se almacenan para permitir copiarlas desde el catálogo protegido.
- La RPC pública devuelve solo el resultado y datos mínimos de licencia. No permite listar claves ni información personal.
- Los clientes distribuidos llevan únicamente la URL y la clave pública. La clave pública es visible por diseño; la autorización real depende de las políticas y RPC.
- El servidor local escucha únicamente en `127.0.0.1`. No publica el panel en internet.

La RPC no incluye una cuota propia por IP ni atestación de dispositivos. Para una operación comercial con tráfico elevado, configura límites de abuso en la capa de entrada de tu despliegue de Supabase y revisa sus cuotas y registros. El respaldo de datos reales se administra en tu proyecto de Supabase; el CSV no sustituye una copia de todas las tablas.

## Estructura para desarrollo

```text
src/
  models/domain.ts       Modelos y reglas de fechas, estados y filtros
  services/demo.ts       Demostración local separada
  services/supabase.ts   Conexión, autenticación y operaciones RPC
  views/App.tsx          Vistas y formularios del panel
  styles.css            Diseño oscuro y responsive
sdk/                     Integración TypeScript y Python para tus programas
scripts/start.mjs        Servidor local del paquete compilado
schema.sql               Instalación completa del backend
tests/                   Reglas de negocio, interfaz y SQL
.github/workflows/       Verificación automática y artefacto compilado
```

Código puro: React + TypeScript + Vite. Se eligió una aplicación web local para usar el mismo panel en Windows, macOS y Linux. No utiliza constructores visuales.

Comandos para el desarrollador o agente que mantenga el proyecto:

```sh
npm ci
npm test
npm run test:db
npm run test:ui
npm run build
npm start
```

`npm run dev` inicia el entorno de desarrollo. `npm start` sirve la compilación de producción. `OPEN_BROWSER=0` evita abrir un navegador y `PORT` cambia el puerto. Si cambias el puerto, el navegador tendrá otro almacenamiento local y deberás introducir de nuevo la conexión.

Las pruebas SQL usan PostgreSQL WASM (PGlite), con un esquema de Auth de prueba. Ejecutan el archivo SQL real y verifican permisos, validación, vencimiento, revocación y cupos. PGlite serializa consultas: no reemplaza una prueba de concurrencia con conexiones independientes contra un proyecto real. Las pruebas de interfaz usan un DOM simulado; no equivalen a una revisión visual en navegador.

Los datos reales de Supabase no se han probado sin un proyecto configurado. Las aplicaciones consumidoras y sus identificadores de hardware deben validarse al integrarlas.
