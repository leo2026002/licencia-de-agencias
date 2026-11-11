import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
try {
  await stat(resolve(directory, "index.html"));
} catch {
  console.error(
    "Falta la versión compilada. Descarga el ZIP listo para usar o ejecuta npm install y npm run build.",
  );
  process.exit(1);
}
const port = Number(process.env.PORT || "4173");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Puerto no válido");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};
const server = http.createServer(async (req, res) => {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  };
  try {
    if (!["GET", "HEAD"].includes(req.method || "")) {
      res.writeHead(405, { ...headers, Allow: "GET, HEAD" });
      res.end();
      return;
    }
    const path = decodeURIComponent(
      new URL(req.url || "/", "http://localhost").pathname,
    );
    const target = resolve(
      directory,
      "." + (path === "/" ? "/index.html" : path),
    );
    if (!target.startsWith(directory + sep)) {
      res.writeHead(403, headers);
      res.end();
      return;
    }
    const bytes = await readFile(target);
    res.writeHead(200, {
      ...headers,
      "Content-Type": types[extname(target)] || "application/octet-stream",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(404, headers);
    res.end("Archivo no encontrado");
  }
});
server.on("error", (error) => {
  console.error(
    `No se pudo iniciar el panel: ${error.message}. Cierra otra copia que esté abierta.`,
  );
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(
    `Panel de Licencias: ${url}\nMantén esta ventana abierta. Pulsa Ctrl+C para cerrar.`,
  );
  if (process.env.OPEN_BROWSER === "0") return;
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const child = spawn(command, args, { stdio: "ignore" });
  child.on("error", () => console.log(`Abre el navegador en ${url}`));
  child.unref();
});
