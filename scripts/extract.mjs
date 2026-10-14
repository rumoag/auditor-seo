// UT-2: extrae las fichas públicas de Google Places para los locales del inventario.
// Uso: node scripts/extract.mjs [--dry-run] [--entrada locales.json] [--out fichas_raw.json]
// La clave va SOLO en la variable de entorno GOOGLE_PLACES_API_KEY. Con --dry-run no se llama a la API ni se necesita clave.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { camposNoDisponibles, construirSalida, cumpleUmbral, elegirCandidato, PORCENTAJE_MINIMO, transformarRespuesta } from './lib/extraccion.mjs';
import { asignarIds, compararConOficiales, evaluarEstricto, validarInventario } from './lib/inventario.mjs';
import { crearClientePlaces, CuotaAgotada, ErrorFatalApi } from './lib/places.mjs';

const consultaDe = l => `${l.nombre} ${l.direccion} ${l.ciudad}`;
const base = (l, placeId) => ({ local_id: l.local_id, marca: l.marca, ciudad: l.ciudad, place_id: placeId ?? '', web_local: l.web_local ?? '', web_declara: l.web_declara ?? [] });

// Orquesta la extracción en serie. Lanza ErrorFatalApi (clave inválida) sin devolver datos parciales.
export async function extraer({ locales, cliente, dormir = ms => new Promise(r => setTimeout(r, ms)), ahora = () => new Date(), pausaMs = 200 }) {
  const fichas = [];
  const fallos = [];
  let cuotaAgotada = false;
  const conIds = asignarIds(locales);

  for (const [i, l] of conIds.entries()) {
    const sinFicha = motivo => {
      fichas.push({ ...base(l, l.place_id), campos: camposNoDisponibles() });
      fallos.push({ local_id: l.local_id, motivo });
    };
    if (cuotaAgotada) {
      sinFicha('cuota agotada');
      continue;
    }
    if (i > 0) await dormir(pausaMs);
    try {
      let placeId = l.place_id;
      if (!placeId) {
        const eleccion = elegirCandidato(l, await cliente.buscarTexto(consultaDe(l)));
        if (!eleccion.ok) {
          sinFicha(eleccion.motivo);
          continue;
        }
        placeId = eleccion.candidato.id;
      }
      const place = await cliente.detalles(placeId);
      fichas.push({ ...base(l, placeId), campos: transformarRespuesta(place) });
    } catch (e) {
      if (e instanceof ErrorFatalApi) throw e;
      if (e instanceof CuotaAgotada) cuotaAgotada = true;
      sinFicha(e.message);
    }
  }
  return construirSalida({ fichas, fallos, extraido: ahora().toISOString() });
}

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
  const valor = nombre => (args.includes(nombre) ? args[args.indexOf(nombre) + 1] : undefined);
  const dryRun = args.includes('--dry-run');
  const entrada = valor('--entrada') ?? 'data/locales.json';
  const salida = valor('--out') ?? 'data/fichas_raw.json';
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!dryRun && !apiKey) throw new Error('Falta la variable de entorno GOOGLE_PLACES_API_KEY. No se ha consultado nada.');

  const locales = await leerJson(entrada);
  const cifras = (await leerJson('data/cifras_oficiales.json', true)) ?? {};
  const validacion = validarInventario(locales);
  const puerta = evaluarEstricto(locales, validacion, compararConOficiales(Array.isArray(locales) ? locales : [], cifras));

  if (dryRun) {
    console.log(`[dry-run] ${Array.isArray(locales) ? locales.length : 0} locales. No se llama a la API.`);
    if (!puerta.ok) puerta.fallos.forEach(f => console.warn(`[dry-run] Una ejecución real se bloquearía: ${f}`));
    if (Array.isArray(locales) && !validacion.errores.length) {
      asignarIds(locales).forEach(l => console.log(`  ${l.local_id}: ${l.place_id ? `detalles de ${l.place_id}` : `búsqueda "${consultaDe(l)}"`}`));
    }
    return;
  }

  if (!puerta.ok) {
    puerta.fallos.forEach(f => console.error(`NO APTO: ${f}`));
    throw new Error('El inventario no es apto para ejecutar con datos reales (UT-1). No se ha consultado nada.');
  }

  const resultado = await extraer({ locales, cliente: crearClientePlaces({ apiKey }) });
  await mkdir(dirname(resolve(salida)), { recursive: true });
  await writeFile(salida, JSON.stringify(resultado, null, 2));
  const r = resultado.resumen;
  console.log(`${r.resueltos}/${r.locales} locales resueltos (${r.porcentaje_resuelto}%) · fallos ${resultado.fallos.length} · ${resultado.extraido}`);
  resultado.fallos.forEach(f => console.warn(`FALLO ${f.local_id}: ${f.motivo}`));
  if (!cumpleUmbral(resultado)) {
    console.error(`NO CUMPLE el criterio de aceptación: se exige al menos un ${PORCENTAJE_MINIMO}% de locales resueltos.`);
    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}
