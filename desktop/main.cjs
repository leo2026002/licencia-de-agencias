const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  net,
  protocol,
  shell,
  session,
} = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const SCHEME = "licencia";
const ORIGIN = `${SCHEME}://panel`;
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
if (process.env.LICENCIAS_TEST_DATA)
  app.setPath("userData", process.env.LICENCIAS_TEST_DATA);
let mainWindow;
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    app.setAppUserModelId("com.leo2026002.licencias");
    const root = path.join(app.getAppPath(), "dist");
    protocol.handle(SCHEME, (request) => {
      const url = new URL(request.url);
      if (url.hostname !== "panel" || request.method !== "GET")
        return new Response("Acceso denegado", { status: 403 });
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return new Response("Ruta inválida", { status: 400 });
      }
      const file = path.resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(root + path.sep))
        return new Response("Acceso denegado", { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    session.defaultSession.setPermissionRequestHandler(
      (_contents, permission, callback) =>
        callback(permission === "clipboard-sanitized-write"),
    );
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      if (details.url.startsWith(ORIGIN + "/"))
        headers["Content-Security-Policy"] = [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        ];
      callback({ responseHeaders: headers });
    });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { label: "Aplicación", submenu: [{ role: "quit", label: "Salir" }] },
        {
          label: "Editar",
          submenu: [
            { role: "undo", label: "Deshacer" },
            { role: "redo", label: "Rehacer" },
            { type: "separator" },
            { role: "cut", label: "Cortar" },
            { role: "copy", label: "Copiar" },
            { role: "paste", label: "Pegar" },
            { role: "selectAll", label: "Seleccionar todo" },
          ],
        },
        {
          label: "Ver",
          submenu: [
            { role: "reload", label: "Actualizar ventana" },
            { role: "resetZoom", label: "Tamaño original" },
            { role: "zoomIn", label: "Acercar" },
            { role: "zoomOut", label: "Alejar" },
            { role: "togglefullscreen", label: "Pantalla completa" },
          ],
        },
        {
          label: "Ayuda",
          submenu: [
            {
              label: "Acerca del programa",
              click: () =>
                dialog.showMessageBox(mainWindow, {
                  type: "info",
                  title: "Panel de Licencias",
                  message: `Panel de Licencias ${app.getVersion()}`,
                  detail:
                    "Versiones Windows y Android sincronizadas mediante tu proyecto de Supabase. Configura la conexión e inicia sesión con tu cuenta administradora en ambos dispositivos.",
                }),
            },
          ],
        },
      ]),
    );
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 850,
      minHeight: 650,
      title: "Panel de Licencias",
      backgroundColor: "#0F172A",
      show: false,
      autoHideMenuBar: true,
      icon: path.join(app.getAppPath(), "desktop", "icon.png"),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    mainWindow.once("ready-to-show", () => mainWindow.show());
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      openExternal(url);
      return { action: "deny" };
    });
    mainWindow.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith(ORIGIN + "/")) {
        event.preventDefault();
        openExternal(url);
      }
    });
    mainWindow.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    mainWindow.webContents.on("render-process-gone", () => {
      dialog.showErrorBox(
        "El panel se cerró inesperadamente",
        "Cierra y vuelve a abrir el programa. Los datos reales permanecen en Supabase.",
      );
    });
    mainWindow
      .loadURL(ORIGIN + "/index.html")
      .catch((error) =>
        dialog.showErrorBox("No se pudo abrir el panel", error.message),
      );
  });
}
function openExternal(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") void shell.openExternal(url.toString());
  } catch {
    /* Bloquear protocolos y destinos inválidos. */
  }
}
app.on("window-all-closed", () => app.quit());
