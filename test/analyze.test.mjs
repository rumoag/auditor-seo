import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { analizar, validarEntrada } from '../scripts/analyze.mjs';

const demo = JSON.parse(await readFile(new URL('../data/fixtures/fichas_demo.json', import.meta.url), 'utf8'));

test('el fixture demo produce un resultado con la estructura esperada', () => {
  const r = analizar(demo);
  assert.equal(r.modo, 'demo');
  assert.equal(r.locales.length, 7);
  for (const k of ['hallazgos', 'locales', 'ranking_extension', 'ranking_acciones', 'no_evaluado', 'fallos', 'pesos', 'tramos']) {
    assert.ok(k in r, k);
  }
});

test('todo hallazgo del demo tiene evidencia, acción y severidad válida', () => {
  const { hallazgos } = analizar(demo);
  assert.ok(hallazgos.length > 0);
  for (const h of hallazgos) {
    assert.ok(h.evidencia && h.accion, h.regla);
    assert.ok(['alta', 'media', 'baja'].includes(h.severidad), h.regla);
  }
});

test('el demo ejercita las reglas esperadas', () => {
  const reglas = new Set(analizar(demo).hallazgos.map(h => h.regla));
  for (const esperada of [
    'WEB_AUSENTE', 'TELEFONO_AUSENTE', 'ATRIBUTOS_VACIOS', 'HORARIO_AUSENTE', 'HORARIO_INCOMPLETO',
    'FOTOS_INSUFICIENTES', 'NOMENCLATURA_INCONSISTENTE', 'CATEGORIA_DISPAR', 'WEB_GENERICA', 'ATRIBUTO_DESAPROVECHADO',
  ]) {
    assert.ok(reglas.has(esperada), `falta ${esperada}`);
  }
});

test('la descripción de la ficha no genera hallazgos (la API no expone la del propietario)', () => {
  const { hallazgos } = analizar(demo);
  assert.equal(hallazgos.some(h => /DESCRIPCION/.test(h.regla)), false);
  // El fixture tiene un local sin descripción y aun así no hay hallazgo.
  assert.ok(demo.fichas.some(f => f.campos.descripcion?.estado === 'ausente'));
});

test('el local sin datos aparece como sin_datos, sin hallazgos y al final', () => {
  const { locales, hallazgos } = analizar(demo);
  const ultimo = locales.at(-1);
  assert.equal(ultimo.estado, 'sin_datos');
  assert.equal(ultimo.score, null);
  assert.equal(hallazgos.filter(h => h.local_id === ultimo.local_id).length, 0);
});

test('una marca de 2 locales se registra como no evaluada en R4 y R5', () => {
  const { no_evaluado } = analizar(demo);
  const beta = no_evaluado.filter(n => n.marca === 'Beta Grill').map(n => n.regla).sort();
  assert.deepEqual(beta, ['CATEGORIA_DISPAR', 'NOMENCLATURA_INCONSISTENTE']);
});

test('los rankings tienen datos y el local peor tiene el score más bajo', () => {
  const r = analizar(demo);
  assert.ok(r.ranking_acciones.length > 0 && r.ranking_extension.length > 0);
  const evaluados = r.locales.filter(l => l.estado === 'evaluado');
  assert.equal(evaluados[0].score, Math.min(...evaluados.map(l => l.score)));
});

test('un campo con estado inválido falla con el local_id', () => {
  const roto = structuredClone(demo);
  roto.fichas[1].campos.web = { estado: 'quizas' };
  assert.throws(() => validarEntrada(roto), /marca-alfa-barcelona.*"web"/);
});

test('una entrada sin fichas o sin campos obligatorios falla con mensaje claro', () => {
  assert.throws(() => validarEntrada({}), /fichas/);
  assert.throws(() => validarEntrada({ fichas: [{ local_id: 'x', marca: 'M', ciudad: 'c' }] }), /campos/);
  assert.throws(() => validarEntrada({ fichas: [{ local_id: 'x', ciudad: 'c', campos: {} }] }), /marca/);
});

test('sin fichas el resultado es vacío y no falla', () => {
  const r = analizar({ fichas: [] });
  assert.equal(r.hallazgos.length, 0);
  assert.equal(r.locales.length, 0);
});
