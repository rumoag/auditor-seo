// UT-5: genera el informe HTML autocontenido a partir de hallazgos.json.
// Uso: node scripts/report.mjs [hallazgos.json] [--out informe.html]   (por defecto: data/hallazgos.json → public/index.html)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { construirModelo, renderizarHtml } from './lib/informe.mjs';

export function validarHallazgos(h) {
  for (const k of ['hallazgos', 'locales', 'ranking_acciones']) {
    if (!Array.isArray(h?.[k])) throw new Error(`Entrada inválida: falta la lista "${k}" (¿es un hallazgos.json generado por analyze.mjs?).`);
  }
  if (!h.pesos || typeof h.pesos !== 'object') throw new Error('Entrada inválida: faltan los "pesos".');
}

export const generarInforme = h => {
  validarHallazgos(h);
  return renderizarHtml(construirModelo(h));
};

async function main() {
  const args = process.argv.slice(2);
  const iOut = args.indexOf('--out');
  const salida = iOut >= 0 ? args[iOut + 1] : 'public/index.html';
  const entrada = args.find((a, i) => !a.startsWith('--') && i !== iOut + 1) ?? 'data/hallazgos.json';

  let datos;
  try {
    datos = JSON.parse(await readFile(entrada, 'utf8'));
  } catch (e) {
    throw new Error(`No se puede leer ${entrada}: ${e.message}. Ejecuta antes "npm run analyze".`);
  }
  const html = generarInforme(datos);
  await mkdir(dirname(resolve(salida)), { recursive: true });
  await writeFile(salida, html);
  console.log(`Informe (${datos.modo === 'demo' ? 'DEMO' : 'real'}) escrito en ${salida}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}
