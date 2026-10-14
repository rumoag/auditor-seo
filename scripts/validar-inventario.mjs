// UT-1: valida data/locales.json. Uso: node scripts/validar-inventario.mjs [locales.json] [--estricto] [--cifras cifras.json]
// Modo normal: informa. Modo --estricto: sale con código 1 si no se cumple el criterio para ejecutar con datos reales.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { asignarIds, compararConOficiales, evaluarEstricto, validarInventario } from './lib/inventario.mjs';

async function leerJson(ruta, opcional = false) {
  try {
    return JSON.parse(await readFile(ruta, 'utf8'));
  } catch (e) {
    if (opcional && e.code === 'ENOENT') return null;
    throw new Error(`No se puede leer ${ruta}: ${e.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const estricto = args.includes('--estricto');
  const iCifras = args.indexOf('--cifras');
  const rutaCifras = iCifras >= 0 ? args[iCifras + 1] : 'data/cifras_oficiales.json';
  const rutaLocales = args.find((a, i) => !a.startsWith('--') && i !== iCifras + 1) ?? 'data/locales.json';

  const locales = await leerJson(rutaLocales);
  const cifras = await leerJson(rutaCifras, true);
  if (cifras === null) console.warn(`AVISO: no existe ${rutaCifras}; no se puede comparar con las cifras oficiales.`);

  const validacion = validarInventario(locales);
  const comparacion = compararConOficiales(Array.isArray(locales) ? locales : [], cifras ?? {});
  const total = Array.isArray(locales) ? locales.length : 0;
  const verificados = Array.isArray(locales) ? locales.filter(l => l?.verificado === true).length : 0;

  console.log(`Inventario: ${total} locales, ${verificados} verificados.`);
  for (const c of comparacion) {
    console.log(`  ${c.marca}: ${c.encontrados} encontrados · anunciados ${c.anunciado ?? 'sin cifra'} · ${c.estado}`);
  }
  for (const e of validacion.errores) console.error(`ERROR [${e.indice}] ${e.marca} · ${e.nombre} · ${e.campo}: ${e.mensaje}`);
  for (const a of validacion.avisos) console.warn(`AVISO [${a.indice}] ${a.marca} · ${a.nombre} · ${a.campo}: ${a.mensaje}`);
  if (Array.isArray(locales) && !validacion.errores.length) {
    const ids = asignarIds(locales).map(l => l.local_id);
    console.log(`Identificadores generados: ${ids.length} (ejemplo: ${ids[0] ?? 'ninguno'}).`);
  }

  if (estricto) {
    const r = evaluarEstricto(locales, validacion, comparacion);
    r.avisos.forEach(a => console.warn(`AVISO: ${a}`));
    if (!r.ok) {
      r.fallos.forEach(f => console.error(`NO APTO: ${f}`));
      process.exit(1);
    }
    console.log('Inventario apto para ejecutar con datos reales.');
  } else if (validacion.errores.length) {
    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}
