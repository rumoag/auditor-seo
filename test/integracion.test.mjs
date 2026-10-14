// Integración entre unidades: UT-2 extracción → UT-3+4 reglas y score → UT-5 informe → UT-6 resumen y comprobación.
// Sin red: el cliente de la API es falso. Los datos son ficticios.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { analizar, validarEntrada } from '../scripts/analyze.mjs';
import { extraer } from '../scripts/extract.mjs';
import { comprobarEntrega, generarResumenEjecutivo } from '../scripts/lib/entrega.mjs';
import { ErrorApi } from '../scripts/lib/places.mjs';
import { generarInforme } from '../scripts/report.mjs';
import { placeCompleto } from './helpers.mjs';

const app = fileURLToPath(new URL('..', import.meta.url));
const FECHA = () => new Date('2026-10-14T09:00:00Z');

const inventario = [
  { marca: 'Marca Alfa', nombre: 'Alfa Madrid', direccion: 'Calle Uno 1', ciudad: 'Madrid', place_id: 'P1', web_local: '', web_declara: [], verificado: true },
  { marca: 'Marca Alfa', nombre: 'Alfa Barcelona', direccion: 'Calle Dos 2', ciudad: 'Barcelona', place_id: 'P2', web_local: '', web_declara: [], verificado: true },
  { marca: 'Marca Alfa', nombre: 'Alfa Valencia', direccion: 'Calle Tres 3', ciudad: 'Valencia', place_id: 'P3', web_local: '', web_declara: [], verificado: true },
  { marca: 'Marca Alfa', nombre: 'Alfa Sevilla', direccion: 'Calle Cuatro 4', ciudad: 'Sevilla', place_id: 'P4', web_local: '', web_declara: [], verificado: true },
  { marca: 'Marca Beta', nombre: 'Beta Bilbao', direccion: 'Calle Cinco 5', ciudad: 'Bilbao', place_id: 'P5', web_local: '', web_declara: [], verificado: true },
];

const respuestas = {
  P1: { ...placeCompleto(), id: 'P1', displayName: { text: 'Marca Alfa - Madrid' }, websiteUri: 'https://alfa.ficticio.example/madrid' },
  P2: { ...placeCompleto(), id: 'P2', displayName: { text: 'Marca Alfa Barcelona' }, primaryType: 'cafe', photos: undefined, nationalPhoneNumber: undefined, websiteUri: 'https://alfa.ficticio.example/barcelona' },
  P3: { ...placeCompleto(), id: 'P3', displayName: { text: 'Marca Alfa - Valencia' }, websiteUri: undefined },
  P4: new ErrorApi('HTTP 500 tras los reintentos', 500),
  P5: { ...placeCompleto(), id: 'P5', displayName: { text: 'Marca Beta' }, websiteUri: 'https://beta.ficticio.example/bilbao' },
};
const cliente = {
  buscarTexto: async () => { throw new Error('no debería buscarse: el inventario trae place_id'); },
  detalles: async id => {
    if (respuestas[id] instanceof Error) throw respuestas[id];
    return respuestas[id];
  },
};

const fichasRaw = await extraer({ locales: inventario, cliente, dormir: async () => {}, ahora: FECHA });
const hallazgos = analizar(fichasRaw);
const html = generarInforme(hallazgos);
const resumen = generarResumenEjecutivo(hallazgos);

test('la extracción produce un contrato que el análisis acepta', () => {
  assert.doesNotThrow(() => validarEntrada(fichasRaw));
  assert.equal(fichasRaw.fichas.length, 5);
  assert.deepEqual(fichasRaw.resumen, { locales: 5, resueltos: 4, porcentaje_resuelto: 80 });
});

test('los identificadores son los mismos en todas las etapas', () => {
  const idsFichas = fichasRaw.fichas.map(f => f.local_id).sort();
  const idsLocales = hallazgos.locales.map(l => l.local_id).sort();
  assert.deepEqual(idsLocales, idsFichas);
  for (const h of hallazgos.hallazgos) assert.ok(idsFichas.includes(h.local_id), h.local_id);
  for (const id of new Set(hallazgos.hallazgos.map(h => h.local_id))) assert.match(html, new RegExp(`informe-detalle-${id}"`));
});

test('el análisis detecta los problemas sembrados y respeta las marcas', () => {
  const reglas = hallazgos.hallazgos.map(h => `${h.local_id}:${h.regla}`);
  for (const esperado of [
    'marca-alfa-barcelona-01:TELEFONO_AUSENTE', 'marca-alfa-barcelona-01:FOTOS_INSUFICIENTES',
    'marca-alfa-barcelona-01:NOMENCLATURA_INCONSISTENTE', 'marca-alfa-barcelona-01:CATEGORIA_DISPAR',
    'marca-alfa-valencia-01:WEB_AUSENTE',
  ]) assert.ok(reglas.includes(esperado), `falta ${esperado}`);
  // Marca Beta tiene 1 local: no se evalúan nombre ni categoría y se registra.
  assert.ok(hallazgos.no_evaluado.some(n => n.marca === 'Marca Beta' && n.regla === 'CATEGORIA_DISPAR'));
  assert.ok(!reglas.some(r => r.startsWith('marca-beta') && /NOMENCLATURA|CATEGORIA/.test(r)));
});

test('el local cuya consulta falló llega al informe como "sin datos", sin hallazgos y sin score', () => {
  const sevilla = hallazgos.locales.find(l => l.local_id === 'marca-alfa-sevilla-01');
  assert.deepEqual([sevilla.estado, sevilla.score], ['sin_datos', null]);
  assert.equal(hallazgos.hallazgos.filter(h => h.local_id === sevilla.local_id).length, 0);
  assert.match(html, /<td data-v="">sin datos<\/td>/);
  assert.match(html, /Locales sin datos \(no evaluados\): 1\./);
  assert.match(html, /Fallos de extracción \(1\)/);
  assert.match(resumen, /1 local no se ha podido evaluar/);
});

test('el score de cada local es el mismo en el análisis y en la tabla del informe', () => {
  for (const l of hallazgos.locales.filter(x => x.estado === 'evaluado')) {
    assert.ok(html.includes(`<td data-v="${l.score}">${l.score}</td>`), `${l.local_id} score ${l.score}`);
  }
});

test('las cifras del informe y del resumen ejecutivo coinciden con los datos', () => {
  const n = hallazgos.locales.length;
  const h = hallazgos.hallazgos.length;
  assert.match(html, new RegExp(`<b>${n}</b>locales analizados`));
  assert.match(html, new RegExp(`<b>${h}</b>problemas accionables`));
  assert.match(resumen, new RegExp(`${n} locales analizados · ${h} problemas accionables`));
  assert.match(resumen, new RegExp(`Analiza los ${n} locales del grupo`));
});

test('una cadena con datos reales no arrastra ninguna marca de demostración', () => {
  assert.equal(hallazgos.modo, 'real');
  assert.doesNotMatch(html, /informe-aviso-demo|DATOS DE EJEMPLO/);
  assert.doesNotMatch(resumen.split('\n')[0], /DATOS DE EJEMPLO/);
  assert.match(html, /Fuente: Google Places API \(New\)\. Fecha de extracción: 14\/10\/2026\./);
});

test('el resumen de la cadena real mantiene el hallazgo principal alineado con el top del informe', () => {
  const principal = hallazgos.ranking_acciones[0];
  assert.ok(resumen.includes(principal.accion));
  // El primer elemento del top 5 del informe es esa misma regla.
  const topHtml = html.slice(html.indexOf('Top 5 acciones'));
  assert.match(topHtml, new RegExp(`<ol><li><b>[^<]+</b> <small>\\(${principal.regla}\\)</small>`));
  // Y el resumen del informe nombra la misma regla en su primera frase.
  assert.match(html.slice(0, html.indexOf('Top 5 acciones')), /El problema con mayor impacto es «/);
});

// Cadena completa a través de los ejecutables, en un directorio temporal
const ejecutar = (script, args, cwd) => spawnSync(process.execPath, [join(app, 'scripts', script), ...args], { cwd, encoding: 'utf8' });

test('cadena por línea de comandos: analyze → report → resumen → comprobación de entrega', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cadena-'));
  try {
    await mkdir(join(dir, 'data'), { recursive: true });
    await writeFile(join(dir, 'data', 'fichas_raw.json'), JSON.stringify(fichasRaw));

    const a = ejecutar('analyze.mjs', [], dir);
    assert.equal(a.status, 0, a.stderr);
    assert.match(a.stdout, /5 locales \(4 evaluados\)/);

    const r = ejecutar('report.mjs', [], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(await readFile(join(dir, 'public', 'index.html'), 'utf8'), /<title>Auditor de SEO Local<\/title>/);

    const s = ejecutar('resumen-ejecutivo.mjs', [], dir);
    assert.equal(s.status, 0, s.stderr);

    const { items } = await comprobarEntrega({ raiz: dir });
    const estado = id => items.find(i => i.id === id).estado;
    assert.equal(estado('informe'), 'ok');
    assert.equal(estado('datos'), 'ok');
    assert.equal(estado('resumen'), 'fallo'); // quedan los huecos del mensaje: lo rellena el usuario
    assert.match(items.find(i => i.id === 'resumen').evidencia, /huecos/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('el informe real generado por la cadena no se puede confundir con una demostración al comprobar la entrega', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cadena-'));
  try {
    await mkdir(join(dir, 'public'), { recursive: true });
    await writeFile(join(dir, 'public', 'index.html'), html);
    const { items } = await comprobarEntrega({ raiz: dir });
    assert.equal(items.find(i => i.id === 'informe').estado, 'ok');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
