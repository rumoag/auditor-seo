import assert from 'node:assert/strict';
import { test } from 'node:test';
import { construirContexto, evaluarLocal } from '../scripts/lib/reglas.mjs';
import { A, N, P, local, localSinDatos } from './helpers.mjs';

// Evalúa un local dentro de un grupo y devuelve sus hallazgos de una regla.
function hallazgos(fichas, objetivo = fichas[0], regla) {
  const ctx = construirContexto(fichas);
  const hs = evaluarLocal(objetivo, ctx);
  return regla ? hs.filter(h => h.regla === regla) : hs;
}

test('un local completo y coherente no genera hallazgos', () => {
  assert.deepEqual(hallazgos([local('X', 'Uno')]), []);
});

test('todo hallazgo lleva evidencia y acción', () => {
  const l = local('X', 'Uno', { descripcion: A(), web: A(), telefono: A(), horario_regular: A(), n_fotos: P(0) });
  const hs = hallazgos([l]);
  assert.ok(hs.length >= 5);
  for (const h of hs) {
    assert.ok(h.evidencia.length > 0, h.regla);
    assert.ok(h.accion.length > 0, h.regla);
  }
});

// R1
test('R1: descripción, web y teléfono ausentes con su severidad', () => {
  const hs = hallazgos([local('X', 'Uno', { descripcion: A(), web: A(), telefono: A() })]);
  const por = Object.fromEntries(hs.map(h => [h.regla, h.severidad]));
  assert.equal(por.DESCRIPCION_AUSENTE, 'media');
  assert.equal(por.WEB_AUSENTE, 'alta');
  assert.equal(por.TELEFONO_AUSENTE, 'alta');
});

test('R1: un campo no_disponible no dispara la regla', () => {
  const hs = hallazgos([local('X', 'Uno', { descripcion: N(), web: N(), telefono: N() })]);
  assert.deepEqual(hs, []);
});

test('R1d: 4 de 5 atributos ausentes dispara; 3 no', () => {
  const attrs = { outdoorSeating: P(true), reservable: A(), delivery: A(), takeout: A(), dineIn: A(), accessibilityOptions: P({ a: true }) };
  assert.equal(hallazgos([local('X', 'Uno', { atributos: attrs })], undefined, 'ATRIBUTOS_VACIOS').length, 1);
  assert.equal(hallazgos([local('X', 'Uno', { atributos: { ...attrs, dineIn: P(true) } })], undefined, 'ATRIBUTOS_VACIOS').length, 0);
});

test('R1d: atributos no_disponible no cuentan como ausentes', () => {
  const attrs = { outdoorSeating: A(), reservable: N(), delivery: N(), takeout: N(), dineIn: N() };
  assert.equal(hallazgos([local('X', 'Uno', { atributos: attrs })], undefined, 'ATRIBUTOS_VACIOS').length, 0);
});

// R2
test('R2: horario ausente es alta; horario con 6 días es incompleto; con 7 no hay hallazgo', () => {
  const sem = Array.from({ length: 7 }, (_, i) => `día ${i}`);
  assert.equal(hallazgos([local('X', 'Uno', { horario_regular: A() })], undefined, 'HORARIO_AUSENTE')[0].severidad, 'alta');
  assert.equal(hallazgos([local('X', 'Uno', { horario_regular: P(sem.slice(0, 6)) })], undefined, 'HORARIO_INCOMPLETO')[0].severidad, 'media');
  assert.equal(hallazgos([local('X', 'Uno', { horario_regular: P(sem) })]).length, 0);
  assert.equal(hallazgos([local('X', 'Uno', { horario_regular: N() })]).length, 0);
});

test('R2: no hay regla de horarios especiales', () => {
  const hs = hallazgos([local('X', 'Uno', { horario_especial: A() })]);
  assert.deepEqual(hs, []);
});

// R3
test('R3: 0 fotos es alta; 4 fotos es media; 5 fotos con mediana alta no dispara', () => {
  const fotos = n => local('X', `c${n}`, { n_fotos: P(n) });
  assert.equal(hallazgos([fotos(0)], undefined, 'FOTOS_INSUFICIENTES')[0].severidad, 'alta');
  assert.equal(hallazgos([fotos(4)], undefined, 'FOTOS_INSUFICIENTES')[0].severidad, 'media');
  // Mediana del grupo 10 → mitad 5; 5 fotos no está por debajo de 5.
  const grupo = [fotos(5), fotos(10), fotos(10)];
  assert.equal(hallazgos(grupo, grupo[0], 'FOTOS_INSUFICIENTES').length, 0);
});

test('R3: menos de la mitad de la mediana del grupo dispara aunque supere 5', () => {
  // Mediana 40 → mitad 20; 12 fotos queda por debajo (la rama relativa).
  const fotos = (c, n) => local('X', c, { n_fotos: P(n) });
  const grupo = [fotos('a', 12), fotos('b', 40), fotos('c', 40)];
  const hs = hallazgos(grupo, grupo[0], 'FOTOS_INSUFICIENTES');
  assert.equal(hs.length, 1);
  assert.equal(hs[0].severidad, 'media');
  assert.match(hs[0].evidencia, /mediana del grupo: 40/);
});

test('R3: n_fotos ausente cuenta como 0 y no_disponible no se evalúa', () => {
  assert.equal(hallazgos([local('X', 'Uno', { n_fotos: A() })], undefined, 'FOTOS_INSUFICIENTES')[0].severidad, 'alta');
  assert.equal(hallazgos([local('X', 'Uno', { n_fotos: N() })], undefined, 'FOTOS_INSUFICIENTES').length, 0);
});

// R4
test('R4: separador y patrón distintos del dominante en una marca de 3 locales', () => {
  const a = local('M', 'Uno', { nombre: P('Marca Alfa - Uno') });
  const b = local('M', 'Dos', { nombre: P('Marca Alfa - Dos') });
  const c = local('M', 'Tres', { nombre: P('Marca Alfa Tres') });
  const d = local('M', 'Cuatro', { nombre: P('Otra Marca - Cuatro') });
  const grupo = [a, b, c, d, local('M', 'Cinco', { nombre: P('Marca Alfa - Cinco') })];
  assert.equal(hallazgos(grupo, a, 'NOMENCLATURA_INCONSISTENTE').length, 0);
  assert.equal(hallazgos(grupo, c, 'NOMENCLATURA_INCONSISTENTE').length, 1); // separador distinto
  assert.equal(hallazgos(grupo, d, 'NOMENCLATURA_INCONSISTENTE').length, 1); // patrón distinto
});

test('R4 y R5 no se evalúan en una marca con menos de 3 locales y se registran', () => {
  const grupo = [local('M', 'Uno', { nombre: P('Marca - Uno') }), local('M', 'Dos', { nombre: P('Otro nombre'), categoria_principal: P('bar') })];
  assert.equal(hallazgos(grupo, grupo[1], 'NOMENCLATURA_INCONSISTENTE').length, 0);
  assert.equal(hallazgos(grupo, grupo[1], 'CATEGORIA_DISPAR').length, 0);
  const ctx = construirContexto(grupo);
  assert.deepEqual(ctx.noEvaluado.map(n => n.regla).sort(), ['CATEGORIA_DISPAR', 'NOMENCLATURA_INCONSISTENTE']);
});

// R5
test('R5: categoría distinta de la dominante es alta; un empate no se evalúa', () => {
  const r = c => local('M', c, { categoria_principal: P('restaurant') });
  const grupo = [r('a'), r('b'), local('M', 'c', { categoria_principal: P('hamburger_restaurant') })];
  const hs = hallazgos(grupo, grupo[2], 'CATEGORIA_DISPAR');
  assert.equal(hs.length, 1);
  assert.equal(hs[0].severidad, 'alta');
  assert.equal(hallazgos(grupo, grupo[0], 'CATEGORIA_DISPAR').length, 0);

  const empate = [r('a'), local('M', 'b', { categoria_principal: P('bar') }), local('M', 'c', { categoria_principal: P('cafe') })];
  assert.equal(hallazgos(empate, empate[1], 'CATEGORIA_DISPAR').length, 0);
  assert.ok(construirContexto(empate).noEvaluado.some(n => n.regla === 'CATEGORIA_DISPAR' && /empate/.test(n.motivo)));
});

test('R5: categoría no_disponible no se evalúa', () => {
  const r = c => local('M', c);
  const grupo = [r('a'), r('b'), local('M', 'c', { categoria_principal: N() })];
  assert.equal(hallazgos(grupo, grupo[2], 'CATEGORIA_DISPAR').length, 0);
});

// R6
test('R6 (A): toda la marca con la misma URL dispara; con una distinta no', () => {
  const w = (c, url) => local('M', c, { web: P(url) });
  const iguales = [w('a', 'https://m.example/'), w('b', 'https://www.m.example'), w('c', 'https://m.example/?x=1')];
  assert.equal(hallazgos(iguales, iguales[0], 'WEB_GENERICA').length, 1);
  const distintas = [w('a', 'https://m.example/a'), w('b', 'https://m.example/b')];
  assert.equal(hallazgos(distintas, distintas[0], 'WEB_GENERICA').length, 0);
});

test('R6 (B): la ficha apunta a la home y el inventario tiene web_local', () => {
  const l = local('M', 'a', { web: P('https://m.example/') }, { web_local: 'https://m.example/a' });
  const otra = local('M', 'b', { web: P('https://m.example/b') });
  assert.equal(hallazgos([l, otra], l, 'WEB_GENERICA').length, 1);
  const sinWebLocal = local('M', 'a', { web: P('https://m.example/') });
  assert.equal(hallazgos([sinWebLocal, otra], sinWebLocal, 'WEB_GENERICA').length, 0);
});

test('R6: un local con A y B produce un solo hallazgo', () => {
  const w = (c, extra) => local('M', c, { web: P('https://m.example/') }, extra);
  const grupo = [w('a', { web_local: 'https://m.example/a' }), w('b')];
  assert.equal(hallazgos(grupo, grupo[0], 'WEB_GENERICA').length, 1);
});

test('R6 (A) no se aplica si algún local de la marca no tiene web resuelta', () => {
  const grupo = [local('M', 'a', { web: P('https://m.example/') }), local('M', 'b', { web: A() })];
  assert.equal(hallazgos(grupo, grupo[0], 'WEB_GENERICA').length, 0);
});

// R7
test('R7: atributo declarado en la web y ausente o falso en la ficha', () => {
  const attrs = (reservable, outdoorSeating = P(true)) => ({ outdoorSeating, reservable, delivery: P(true), takeout: P(true), dineIn: P(true), accessibilityOptions: P({ wheelchairAccessibleEntrance: true }) });
  const ausente = local('X', 'a', { atributos: attrs(A()) }, { web_declara: ['reservas'] });
  const falso = local('X', 'b', { atributos: attrs(P(false)) }, { web_declara: ['reservas'] });
  const cumple = local('X', 'c', { atributos: attrs(P(true)) }, { web_declara: ['reservas'] });
  assert.equal(hallazgos([ausente], ausente, 'ATRIBUTO_DESAPROVECHADO').length, 1);
  assert.equal(hallazgos([falso], falso, 'ATRIBUTO_DESAPROVECHADO').length, 1);
  assert.equal(hallazgos([cumple], cumple, 'ATRIBUTO_DESAPROVECHADO').length, 0);
  assert.match(hallazgos([ausente], ausente, 'ATRIBUTO_DESAPROVECHADO')[0].accion, /reservas/);
});

test('R7: accesible usa accessibilityOptions (objeto con alguna opción verdadera)', () => {
  const base = local('X', 'a', {}, { web_declara: ['accesible'] });
  assert.equal(hallazgos([base], base, 'ATRIBUTO_DESAPROVECHADO').length, 0);
  const sin = local('X', 'b', { atributos: { ...base.campos.atributos, accessibilityOptions: P({ wheelchairAccessibleEntrance: false }) } }, { web_declara: ['accesible'] });
  assert.equal(hallazgos([sin], sin, 'ATRIBUTO_DESAPROVECHADO').length, 1);
});

test('R7: atributo no_disponible o declaración desconocida no dispara', () => {
  const nd = local('X', 'a', { atributos: { ...local('X', 'z').campos.atributos, reservable: N() } }, { web_declara: ['reservas', 'valet'] });
  assert.equal(hallazgos([nd], nd, 'ATRIBUTO_DESAPROVECHADO').length, 0);
});

test('un local sin datos se excluye del contexto', () => {
  const grupo = [local('X', 'a'), localSinDatos('X', 'b')];
  assert.equal(construirContexto(grupo).marcas.X.n, 1);
});
