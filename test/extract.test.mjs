import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { analizar, validarEntrada } from '../scripts/analyze.mjs';
import { extraer } from '../scripts/extract.mjs';
import { CuotaAgotada, ErrorApi, ErrorFatalApi } from '../scripts/lib/places.mjs';
import { placeCompleto } from './helpers.mjs';

const script = fileURLToPath(new URL('../scripts/extract.mjs', import.meta.url));
const FECHA = () => new Date('2026-10-14T10:00:00Z');
const sinEspera = async () => {};

const loc = (nombre, extra = {}) => ({
  marca: 'Voltereta', nombre, direccion: 'Calle Falsa, 12', ciudad: 'Valencia', place_id: '', url_ficha: '',
  web_local: 'https://v.example/x', web_declara: ['terraza'], verificado: true, ...extra,
});

// Cliente falso: `detalles` por place_id, `busqueda` por consulta.
function falso({ busqueda = {}, detalles = {} } = {}) {
  const llamadas = { busqueda: [], detalles: [] };
  return {
    llamadas,
    async buscarTexto(q) {
      llamadas.busqueda.push(q);
      const r = busqueda[q] ?? busqueda['*'];
      if (r instanceof Error) throw r;
      return r ?? [];
    },
    async detalles(id) {
      llamadas.detalles.push(id);
      const r = detalles[id] ?? detalles['*'];
      if (r instanceof Error) throw r;
      return r ?? { ...placeCompleto(), id };
    },
  };
}
const unico = id => [{ id, displayName: { text: 'x' }, formattedAddress: 'Calle Falsa, 12, Valencia' }];

test('resuelve el place_id por búsqueda, consulta detalles y rellena la ficha', async () => {
  const cliente = falso({ busqueda: { '*': unico('P1') } });
  const r = await extraer({ locales: [loc('Local A')], cliente, dormir: sinEspera, ahora: FECHA });
  assert.deepEqual(cliente.llamadas.busqueda, ['Local A Calle Falsa, 12 Valencia']);
  assert.deepEqual(cliente.llamadas.detalles, ['P1']);
  const f = r.fichas[0];
  assert.equal(f.local_id, 'voltereta-valencia-01');
  assert.equal(f.place_id, 'P1');
  assert.equal(f.web_local, 'https://v.example/x');
  assert.deepEqual(f.web_declara, ['terraza']);
  assert.equal(f.campos.nombre.estado, 'presente');
  assert.deepEqual(r.fallos, []);
  assert.equal(r.extraido, '2026-10-14T10:00:00.000Z');
});

test('si el inventario ya trae place_id no busca', async () => {
  const cliente = falso();
  await extraer({ locales: [loc('Local A', { place_id: 'YA' })], cliente, dormir: sinEspera, ahora: FECHA });
  assert.deepEqual(cliente.llamadas.busqueda, []);
  assert.deepEqual(cliente.llamadas.detalles, ['YA']);
});

test('una búsqueda sin resultado único y sin coincidencia es un fallo y no consulta detalles', async () => {
  const cliente = falso({ busqueda: { '*': [
    { id: 'A', displayName: { text: 'a' }, formattedAddress: 'Calle Mayor 3' },
    { id: 'B', displayName: { text: 'b' }, formattedAddress: 'Plaza Real 5' },
  ] } });
  const r = await extraer({ locales: [loc('Local A')], cliente, dormir: sinEspera, ahora: FECHA });
  assert.deepEqual(cliente.llamadas.detalles, []);
  assert.equal(r.fallos.length, 1);
  assert.match(r.fallos[0].motivo, /ningún candidato coincide/);
  assert.equal(r.fichas[0].campos.nombre.estado, 'no_disponible');
  assert.deepEqual(r.resumen, { locales: 1, resueltos: 0, porcentaje_resuelto: 0 });
});

test('el fallo de un local no impide procesar los demás', async () => {
  const cliente = falso({ busqueda: { '*': unico('P1') }, detalles: { P1: new ErrorApi('HTTP 404', 404) } });
  const r = await extraer({ locales: [loc('Local A'), loc('Local B', { place_id: 'P2' })], cliente, dormir: sinEspera, ahora: FECHA });
  assert.equal(r.fichas.length, 2);
  assert.deepEqual(r.fallos.map(f => f.local_id), ['voltereta-valencia-01']);
  assert.equal(r.fichas[0].campos.nombre.estado, 'no_disponible');
  assert.equal(r.fichas[1].campos.nombre.estado, 'presente');
  assert.equal(r.resumen.resueltos, 1);
});

test('una clave inválida aborta toda la ejecución sin devolver datos parciales', async () => {
  const cliente = falso({ detalles: { '*': new ErrorFatalApi('Clave inválida', 403) } });
  await assert.rejects(extraer({ locales: [loc('A', { place_id: 'P1' }), loc('B', { place_id: 'P2' })], cliente, dormir: sinEspera }), ErrorFatalApi);
  assert.equal(cliente.llamadas.detalles.length, 1);
});

test('cuota agotada: ese local y los restantes quedan como fallo, sin consultarlos', async () => {
  const cliente = falso({ detalles: { P2: new CuotaAgotada('Cuota agotada') } });
  const locales = [loc('A', { place_id: 'P1' }), loc('B', { place_id: 'P2' }), loc('C', { place_id: 'P3' }), loc('D', { place_id: 'P4' })];
  const r = await extraer({ locales, cliente, dormir: sinEspera, ahora: FECHA });
  assert.deepEqual(cliente.llamadas.detalles, ['P1', 'P2']);
  assert.equal(r.fichas.length, 4);
  assert.deepEqual(r.fallos.map(f => f.motivo), ['Cuota agotada', 'cuota agotada', 'cuota agotada']);
  assert.equal(r.fichas[0].campos.nombre.estado, 'presente');
  for (const f of r.fichas.slice(1)) assert.equal(f.campos.nombre.estado, 'no_disponible');
});

test('hace una pausa entre peticiones, pero no antes de la primera', async () => {
  const esperas = [];
  await extraer({
    locales: [loc('A', { place_id: 'P1' }), loc('B', { place_id: 'P2' }), loc('C', { place_id: 'P3' })],
    cliente: falso(), dormir: async ms => esperas.push(ms), ahora: FECHA,
  });
  assert.deepEqual(esperas, [200, 200]);
});

test('el resultado cumple el contrato de UT-3+4 y produce hallazgos', async () => {
  const cliente = falso({ detalles: { P2: { id: 'P2', displayName: { text: 'Sin datos' } } } });
  const locales = [loc('A', { place_id: 'P1' }), loc('B', { place_id: 'P2' }), loc('C', { place_id: 'P3', ciudad: 'Madrid' })];
  const r = await extraer({ locales, cliente, dormir: sinEspera, ahora: FECHA });
  assert.doesNotThrow(() => validarEntrada(r));
  const h = analizar(r);
  assert.equal(h.locales.length, 3);
  assert.ok(h.hallazgos.some(x => x.local_id === 'voltereta-valencia-02' && x.regla === 'TELEFONO_AUSENTE'));
  assert.equal(h.modo, 'real');
});

test('un local fallido aparece como sin_datos en el análisis y no genera hallazgos', async () => {
  const cliente = falso({ detalles: { P1: new ErrorApi('HTTP 500', 500) } });
  const r = await extraer({ locales: [loc('A', { place_id: 'P1' })], cliente, dormir: sinEspera, ahora: FECHA });
  const h = analizar(r);
  assert.equal(h.locales[0].estado, 'sin_datos');
  assert.deepEqual(h.hallazgos, []);
  assert.equal(h.fallos.length, 1);
});

// Ejecutable (sin red)
async function conTemporal(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'extract-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const ejecutar = (args, env = {}) => spawnSync(process.execPath, [script, ...args], {
  encoding: 'utf8',
  env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
});
const existe = async ruta => stat(ruta).then(() => true, () => false);

test('sin clave, el ejecutable falla antes de consultar nada', async () => {
  await conTemporal(async dir => {
    const entrada = join(dir, 'l.json');
    await writeFile(entrada, JSON.stringify([loc('A')]));
    const r = ejecutar(['--entrada', entrada, '--out', join(dir, 'f.json')]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /GOOGLE_PLACES_API_KEY/);
    assert.equal(await existe(join(dir, 'f.json')), false);
  });
});

test('con un inventario sin verificar, la puerta bloquea antes de la red y no escribe nada', async () => {
  await conTemporal(async dir => {
    const entrada = join(dir, 'l.json');
    await writeFile(entrada, JSON.stringify([loc('A', { verificado: false })]));
    const r = ejecutar(['--entrada', entrada, '--out', join(dir, 'f.json')], { GOOGLE_PLACES_API_KEY: 'clave-ficticia-de-prueba' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /NO APTO/);
    assert.match(r.stderr, /sin verificar/);
    assert.ok(!r.stderr.includes('clave-ficticia-de-prueba'));
    assert.equal(await existe(join(dir, 'f.json')), false);
  });
});

test('--dry-run no necesita clave, no llama a la API y lista las consultas', async () => {
  await conTemporal(async dir => {
    const entrada = join(dir, 'l.json');
    await writeFile(entrada, JSON.stringify([loc('A'), loc('B', { place_id: 'PID' })]));
    const r = ejecutar(['--dry-run', '--entrada', entrada, '--out', join(dir, 'f.json')]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /búsqueda "A Calle Falsa, 12 Valencia"/);
    assert.match(r.stdout, /detalles de PID/);
    assert.equal(await existe(join(dir, 'f.json')), false);
  });
});

test('--dry-run con inventario sin verificar avisa de que una ejecución real se bloquearía, sin fallar', async () => {
  await conTemporal(async dir => {
    const entrada = join(dir, 'l.json');
    await writeFile(entrada, JSON.stringify([loc('A', { verificado: false })]));
    const r = ejecutar(['--dry-run', '--entrada', entrada]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /se bloquearía/);
  });
});

test('--dry-run sobre el inventario real del proyecto funciona y muestra las 16 consultas', () => {
  const r = ejecutar(['--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout.match(/búsqueda "/g) ?? []).length, 16);
});

test('la clave no aparece en el archivo de salida generado por extraer', async () => {
  const r = await extraer({ locales: [loc('A', { place_id: 'P1' })], cliente: falso(), dormir: sinEspera, ahora: FECHA });
  assert.ok(!JSON.stringify(r).includes('clave'));
  assert.equal(r.fuente, 'Google Places API (New)');
  const texto = await readFile(fileURLToPath(new URL('../scripts/extract.mjs', import.meta.url)), 'utf8');
  assert.ok(!/AIza[0-9A-Za-z_-]{20,}/.test(texto));
});
