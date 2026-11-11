# Panel de Licencias · Windows y Android

Aplicaciones instalables en español para administrar y vender licencias de tus programas. La versión de PC y la de celular comparten el mismo catálogo mediante Supabase.

## Descargar e instalar

Descarga los archivos de la última ejecución exitosa de **Actions → Compilar aplicaciones instalables**, en este repositorio:

- **Instalador-Windows**: contiene un instalador `.exe` para Windows 10/11 de 64 bits. Descomprime el ZIP, abre el instalador y sigue el asistente. El programa queda en el escritorio y en el menú Inicio.
- **Aplicacion-Android-APK**: contiene `Panel-Licencias-Android.apk`. Descomprime el ZIP en el teléfono, abre el APK y permite su instalación si Android lo solicita. Compatible con Android 7 o posterior.

**No tienes que instalar Node.js, abrir una terminal, descargar dependencias ni copiar código.** El motor de ejecución y todos los recursos de la interfaz están incluidos. `Code → Download ZIP` descarga las fuentes de desarrollo; los instaladores se encuentran en los artefactos de Actions.

Esta entrega se distribuye directamente: Windows no tiene certificado comercial de firma, y el APK utiliza la firma de desarrollo de Android. No es una publicación en Microsoft Store o Google Play. Para actualizaciones Android con la misma firma y publicación en tienda hará falta configurar una clave privada de firma propia; esta entrega no guarda claves privadas en el repositorio público.

## Sincronización entre PC y celular

1. Abre Configuración en Windows y en Android.
2. Introduce **la misma URL y clave pública de Supabase** en ambos.
3. Inicia sesión con tu cuenta administradora.
4. Las aplicaciones, licencias y equipos se actualizan en ambos dispositivos.

La sincronización escucha cambios con Supabase Realtime. También actualiza al regresar a la app, al recuperar la conexión y cada 30 segundos como respaldo. El indicador superior muestra **Sincronizado**, **Sincronizando** o **Sin conexión**. Las operaciones reales requieren internet; no se encolan ventas offline.

La primera apertura permite explorar una **demostración local**. Esos datos ficticios no se sincronizan y sus claves no sirven en tus programas. Para usar datos reales, primero hay que preparar el proyecto de Supabase. Las cuentas, tablas y datos se mantienen en tu proyecto; el instalador no contiene credenciales privadas.

Si ya instalaste el esquema anterior, aplica `supabase/migrations/0002_sincronizacion.sql` en SQL Editor para habilitar Realtime. Si aún no lo aplicaste, la consulta de respaldo sigue actualizando cada 30 segundos. En instalaciones nuevas, `schema.sql` ya incluye esta configuración.

El catálogo permite generar claves, importar claves de tus generadores, copiar, buscar, filtrar y exportar CSV. En Android, la exportación abre la opción nativa para guardar o compartir el archivo. Puedes renovar, revocar y liberar equipos en cualquiera de las dos versiones.

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

## Estructura y mantenimiento

```text
src/models/               Modelos y reglas de licencias
src/services/             Supabase, sincronización y funciones nativas
src/views/                Interfaz compartida para Windows y Android
desktop/main.cjs          Aplicación Windows con Electron
capacitor.config.ts       Configuración de la aplicación Android
scripts/                  Compilación y preparación de iconos/proyectos
supabase/migrations/       Actualización de Realtime para proyectos existentes
sdk/                      Clientes TypeScript y Python para tus programas
schema.sql                Instalación del backend en Supabase
tests/                    Pruebas de reglas, SQL, sincronización e instaladores
.github/workflows/        Compilación y verificación automática de EXE y APK
```

El código de escritorio se ejecuta en una ventana propia, sin servidor local ni navegador externo. El renderizador no tiene acceso a Node.js y usa aislamiento de contexto y sandbox. En Android se utiliza una actividad nativa Capacitor con la interfaz incluida dentro del APK. La sesión y configuración se conservan por dispositivo. La base de datos central y las restricciones de licencia permanecen en Supabase.

Los siguientes comandos son para el agente o desarrollador que mantenga el proyecto; no son necesarios para instalarlo:

```sh
npm ci
npm test
npm run test:db
npm run test:ui
npm run desktop:dist
npm run android:prepare
```

El instalador Windows se compila con Electron Builder/NSIS en Windows. El APK se compila con Gradle y Java 21 sobre el proyecto generado por Capacitor 8. El directorio `android/` se genera desde la configuración y no contiene cambios manuales que deban recuperarse.

La automatización instala el EXE resultante en Windows y prueba creación de aplicaciones, emisión, revocación y portapapeles. También instala el APK en un emulador Android y verifica la pantalla inicial y la apertura del formulario mediante UI Automator. Los flujos completos de emisión y revocación se comprueban en Windows y en las pruebas de interfaz compartida. Las capturas se guardan como artefactos separados.

Las pruebas de sincronización comprueban dos clientes, cambios remotos, recuperación de red y descarte de respuestas tras cerrar sesión mediante un transporte simulado. Las pruebas SQL ejecutan `schema.sql` en PostgreSQL WASM, con Auth de prueba; no sustituyen una prueba de concurrencia con conexiones independientes. La sincronización contra un Supabase real queda pendiente de configurar tu proyecto y tus credenciales públicas.
