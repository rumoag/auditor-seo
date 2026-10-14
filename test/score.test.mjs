import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PESOS, calcularScore, rankingAcciones, rankingExtension, resumirLocales, tramoDe } from '../scripts/lib/score.mjs';

const h = (local_id, regla, severidad) => ({ local_id, local: local_id, marca: 'M', regla, severidad, evidencia: 'e', accion: 'a' });

test('pesos documentados: alta 15, media 7, baja 3', () => {
  assert.deepEqual(PESOS, { alta: 15, media: 7, baja: 3 });
});

test('score es 100 menos la suma de pesos', () => {
  assert.equal(calcularScore([]), 100);
  assert.equal(calcularScore([h('a', 'R', 'alta'), h('a', 'S', 'media'), h('a', 'T', 'baja')]), 100 - 15 - 7 - 3);
});

test('el score tiene suelo en 0', () => {
  const muchos = Array.from({ length: 10 }, (_, i) => h('a', `R${i}`, 'alta'));
  assert.equal(calcularScore(muchos), 0);
});

test('tramos en los límites', () => {
  assert.equal(tramoDe(100), 'verde');
  assert.equal(tramoDe(80), 'verde');
  assert.equal(tramoDe(79), 'ambar');
  assert.equal(tramoDe(50), 'ambar');
  assert.equal(tramoDe(49), 'rojo');
  assert.equal(tramoDe(0), 'rojo');
});

test('resumirLocales ordena peores primero, desempata por hallazgos y deja los sin datos al final', () => {
  const locales = [
    { local_id: 'sin', local: 'Sin', marca: 'M', ciudad: 'c', sin_datos: true },
    { local_id: 'bien', local: 'Bien', marca: 'M', ciudad: 'c', sin_datos: false },
    { local_id: 'a', local: 'A', marca: 'M', ciudad: 'c', sin_datos: false },
    { local_id: 'b', local: 'B', marca: 'M', ciudad: 'c', sin_datos: false },
  ];
  // a: 15 (1 alta) → 85; b: 7+3+3+... = 3 baja = 9 → 91; para empatar usamos mismo score con distinto nº de hallazgos
  const hs = [h('a', 'R', 'alta'), h('b', 'R', 'media'), h('b', 'S', 'media')]; // a: 85, b: 86
  const res = resumirLocales(locales, hs);
  assert.deepEqual(res.map(l => l.local_id), ['a', 'b', 'bien', 'sin']);
  assert.equal(res[3].estado, 'sin_datos');
  assert.equal(res[3].score, null);
  assert.equal(res[0].tramo, 'verde');
});

test('resumirLocales desempata por más hallazgos y luego por nombre', () => {
  const locales = ['x', 'y', 'z'].map(id => ({ local_id: id, local: id, marca: 'M', ciudad: 'c', sin_datos: false }));
  // x: 2 bajas y 1 media (3+3+7=13 → 87)... se fuerza el empate con el mismo score y distinto nº de hallazgos
  const hs = [h('x', 'R', 'media'), h('x', 'S', 'baja'), h('x', 'T', 'baja'), h('x', 'U', 'baja'), h('y', 'R', 'media'), h('y', 'S', 'media'), h('y', 'T', 'baja')];
  // x: 7+9 = 16 → 84 (4 hallazgos); y: 14+3 = 17 → 83. z: 100
  const res = resumirLocales(locales, hs);
  assert.deepEqual(res.map(l => l.local_id), ['y', 'x', 'z']);
  const empate = resumirLocales(locales.slice(0, 2), []);
  assert.deepEqual(empate.map(l => l.local_id), ['x', 'y']);
});

test('con el mismo score, el local con más hallazgos va primero', () => {
  const locales = ['a', 'b'].map(id => ({ local_id: id, local: id, marca: 'M', ciudad: 'c', sin_datos: false }));
  // a: 1 alta = 15 → 85 (1 hallazgo); b: 5 bajas = 15 → 85 (5 hallazgos)
  const hs = [h('a', 'R', 'alta'), ...[1, 2, 3, 4, 5].map(i => h('b', `B${i}`, 'baja'))];
  const res = resumirLocales(locales, hs);
  assert.equal(res[0].score, res[1].score);
  assert.deepEqual(res.map(l => l.local_id), ['b', 'a']);
});

test('rankingExtension ordena por locales afectados y desempata por impacto', () => {
  const hs = [h('a', 'COMUN', 'baja'), h('b', 'COMUN', 'baja'), h('c', 'COMUN', 'baja'), h('a', 'GRAVE', 'alta'), h('b', 'GRAVE', 'alta'), h('a', 'RARA', 'alta')];
  const r = rankingExtension(hs);
  assert.deepEqual(r.map(x => x.regla), ['COMUN', 'GRAVE', 'RARA']);
  assert.deepEqual(r[0], { regla: 'COMUN', locales: 3, impacto: 9, accion: 'a' });
});

test('rankingAcciones ordena por impacto agregado y desempata por locales', () => {
  const hs = [h('a', 'COMUN', 'baja'), h('b', 'COMUN', 'baja'), h('c', 'COMUN', 'baja'), h('a', 'GRAVE', 'alta'), h('b', 'GRAVE', 'alta'), h('a', 'RARA', 'alta')];
  assert.deepEqual(rankingAcciones(hs).map(x => x.regla), ['GRAVE', 'RARA', 'COMUN']);
  const empate = [h('a', 'UNA', 'alta'), h('a', 'DOS', 'media'), h('b', 'DOS', 'media'), h('c', 'DOS', 'baja')];
  // UNA: impacto 15, 1 local; DOS: 7+7+3 = 17
  assert.equal(rankingAcciones(empate)[0].regla, 'DOS');
});

test('un mismo local con la misma regla cuenta una vez en locales afectados', () => {
  const hs = [h('a', 'R', 'media'), h('a', 'R', 'media')];
  assert.equal(rankingExtension(hs)[0].locales, 1);
});
