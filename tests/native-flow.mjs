import assert from "node:assert/strict";

export async function checkNativeFlow(page, label) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .getByRole("heading", { name: "Tu software, bajo control." })
    .waitFor({ timeout: 40_000 });
  assert.equal(
    await page.evaluate(() => typeof globalThis.require),
    "undefined",
    "El renderizador no debe tener acceso a Node.js",
  );
  const menu = page.getByRole("button", { name: "Abrir navegación" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: /^Aplicaciones$/ }).click();
  await page.getByRole("button", { name: "Nueva aplicación" }).click();
  let modal = page.getByRole("dialog");
  await modal
    .getByLabel("Nombre del programa", { exact: true })
    .fill(`Programa ${label}`);
  await modal
    .getByLabel("Código de aplicación")
    .fill(`nativo-${label.toLowerCase()}`);
  await modal.getByLabel("Prefijo de las claves").fill("NAT");
  await modal.getByRole("button", { name: "Registrar aplicación" }).click();
  await page
    .getByRole("heading", { name: `Programa ${label}`, exact: true })
    .waitFor();
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: /^Licencias/ }).click();
  await page.getByRole("button", { name: "Nueva licencia" }).click();
  modal = page.getByRole("dialog");
  await modal
    .getByLabel("Nombre del cliente", { exact: true })
    .fill(`Cliente ${label}`);
  await modal.getByRole("button", { name: "Crear licencia" }).click();
  await page
    .getByRole("button", { name: `Cliente ${label}`, exact: true })
    .click();
  modal = page.getByRole("dialog");
  const key = await modal
    .getByRole("textbox", { name: "Clave de licencia", exact: true })
    .inputValue();
  assert.match(key, /^[A-Z0-9]+-(?:[A-F0-9]{8}-){3}[A-F0-9]{8}$/);
  await modal.getByRole("button", { name: "Revocar licencia" }).click();
  await modal.getByText("Revocada", { exact: true }).waitFor();
  await modal.getByRole("button", { name: "Copiar clave completa" }).click();
  await page
    .getByText("Clave copiada al portapapeles", { exact: true })
    .waitFor();
  await modal.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.screenshot({ path: `native-test-results/${label}.png` });
  assert.deepEqual(
    errors,
    [],
    "La aplicación no debe generar errores de JavaScript",
  );
  console.log(
    `${label}: ventana nativa, aplicación, licencia, revocación y portapapeles verificados.`,
  );
}
