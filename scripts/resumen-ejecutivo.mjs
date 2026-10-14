// UT-6: genera el resumen ejecutivo y el borrador del mensaje desde hallazgos.json.
// Uso: node scripts/resumen-ejecutivo.mjs [hallazgos.json] [--out entrega/resumen_ejecutivo.md]
// La salida va a entrega/ (ignorado por git): no debe publicarse.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generarResumenEjecutivo } from './lib/entrega.mjs';
import { validarHallazgos } from './report.mjs';

async function main() {
  const args = process.argv.slice(2);
  const iOut = args.indexOf('--out');
  const salida = iOut >= 0 ? args[iOut + 1] : 'entrega/resumen_ejecutivo.md';
  const entrada = args.find((a, i) => !a.startsWith('--') && i !== iOut + 1) ?? 'data/hallazgos.json';

  let datos;
  try {
    datos = JSON.parse(await readFile(entrada, 'utf8'));
  } catch (e) {
    throw new Error(`No se puede leer ${entrada}: ${e.message}. Ejecuta antes "npm run analyze".`);
  }
  validarHallazgos(datos);
  await mkdir(dirname(resolve(salida)), { recursive: true });
  await writeFile(salida, generarResumenEjecutivo(datos));
  console.log(`Resumen ejecutivo (${datos.modo === 'demo' ? 'DEMO' : 'real'}) escrito en ${salida}`);
  console.log('Rellena los huecos [ENLACE…] y [PASO 2…] antes de enviarlo.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}
