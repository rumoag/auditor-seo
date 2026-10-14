import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeCompleto } from './helpers.mjs';
import { camposNoDisponibles, construirSalida, cumpleUmbral, direccionCoincide, elegirCandidato, transformarRespuesta } from '../scripts/lib/extraccion.mjs';

test('una respuesta completa deja todos los campos presentes con su valor', () => {
  const c = transformarRespuesta(placeCompleto());
  assert.deepEqual(c.nombre, { estado: 'presente', valor: 'Local Ficticio' });
  assert.deepEqual(c.categoria_principal, { estado: 'presente', valor: 'restaurant' });
  assert.deepEqual(c.categorias, { estado: 'presente', valor: ['restaurant', 'food'] });
  assert.equal(c.codigo_postal.valor, '46015');
  assert.equal(c.telefono.valor, '960 00 00 00');
  assert.equal(c.web.valor, 'https://ficticio.example/local');
  assert.equal(c.horario_regular.valor.length, 7);
  assert.equal(c.horario_especial.valor.length, 1);
  assert.deepEqual(c.n_fotos, { estado: 'presente', valor: 3 });
  assert.equal(c.n_resenas.valor, 120);
  assert.equal(c.nota.valor, 4.4);
  assert.equal(c.descripcion.valor, 'Descripción ficticia');
  for (const campo of Object.values(c).filter(v => v.estado)) assert.equal(campo.estado, 'presente');
});

test('un campo que la API no devuelve queda ausente, nunca no_disponible', () => {
  const c = transformarRespuesta({ id: 'x', displayName: { text: 'Solo nombre' } });
  assert.equal(c.nombre.estado, 'presente');
  for (const [k, v] of Object.entries(c)) {
    if (k === 'nombre' || k === 'atributos') continue;
    assert.deepEqual(v, { estado: 'ausente' }, k);
  }
  for (const v of Object.values(c.atributos)) assert.deepEqual(v, { estado: 'ausente' });
});

test('false, 0 y las listas vacías cuentan como presentes', () => {
  const c = transformarRespuesta({ ...placeCompleto(), delivery: false, rating: 0, userRatingCount: 0, photos: [], types: [] });
  assert.deepEqual(c.atributos.delivery, { estado: 'presente', valor: false });
  assert.deepEqual(c.nota, { estado: 'presente', valor: 0 });
  assert.deepEqual(c.n_resenas, { estado: 'presente', valor: 0 });
  assert.deepEqual(c.n_fotos, { estado: 'presente', valor: 0 });
  assert.deepEqual(c.categorias, { estado: 'presente', valor: [] });
});

test('cada atributo tiene su propio estado', () => {
  const c = transformarRespuesta({ ...placeCompleto(), reservable: undefined, accessibilityOptions: undefined });
  assert.equal(c.atributos.reservable.estado, 'ausente');
  assert.equal(c.atributos.accessibilityOptions.estado, 'ausente');
  assert.equal(c.atributos.outdoorSeating.estado, 'presente');
});

test('una respuesta vacía o nula no falla', () => {
  assert.equal(transformarRespuesta(undefined).nombre.estado, 'ausente');
  assert.equal(transformarRespuesta(null).n_fotos.estado, 'ausente');
});

test('camposNoDisponibles marca todos los campos y atributos como no_disponible', () => {
  const c = camposNoDisponibles();
  for (const [k, v] of Object.entries(c)) {
    if (k === 'atributos') continue;
    assert.deepEqual(v, { estado: 'no_disponible' }, k);
  }
  assert.equal(Object.keys(c.atributos).length, 6);
  for (const v of Object.values(c.atributos)) assert.deepEqual(v, { estado: 'no_disponible' });
});

test('la transformación y los no disponibles tienen las mismas claves', () => {
  assert.deepEqual(Object.keys(camposNoDisponibles()).sort(), Object.keys(transformarRespuesta(placeCompleto())).sort());
  assert.deepEqual(Object.keys(camposNoDisponibles().atributos).sort(), Object.keys(transformarRespuesta(placeCompleto()).atributos).sort());
});

// Dirección y elección de candidato
const local = direccion => ({ direccion, nombre: 'Local', ciudad: 'Valencia' });

test('direccionCoincide tolera variantes de ortografía (Cortes/Corts, Valencianas/Valencianes)', () => {
  assert.equal(direccionCoincide(local('Av. Cortes Valencianas 50'), 'Av. de les Corts Valencianes, 50, 46015 València, España'), true);
  assert.equal(direccionCoincide(local("Pg. de l'Albereda, 51, 46023"), "Passeig de l'Albereda, 51, 46023 València, España"), true);
});

test('direccionCoincide exige el número de portal', () => {
  assert.equal(direccionCoincide(local('Av. Cortes Valencianas 50'), 'Av. de les Corts Valencianes, 26, València'), false);
});

test('direccionCoincide rechaza otra calle y acepta si falta una palabra de varias', () => {
  assert.equal(direccionCoincide(local('Calle Isabel la Católica, 11, 46004'), 'Carrer de Colón, 11, València'), false);
  assert.equal(direccionCoincide(local("L'Epicentre. Av. Advocat Fausto Caruana, 37"), 'Av. Advocat Fausto Caruana, 37, Sagunto'), true);
});

test('el código postal de 5 cifras no cuenta como número de portal', () => {
  assert.equal(direccionCoincide(local('C/ Navas, 33, 03001'), 'Calle Navas, 33, 03001 Alicante'), true);
  assert.equal(direccionCoincide(local('C/ Navas, 33, 03001'), 'Calle Navas, 33, Alicante'), true);
});

const cand = (id, direccion, nombre = id) => ({ id, displayName: { text: nombre }, formattedAddress: direccion });

test('elegirCandidato: sin resultados no elige', () => {
  assert.equal(elegirCandidato(local('Calle Falsa 1'), []).ok, false);
  assert.equal(elegirCandidato(local('Calle Falsa 1'), undefined).ok, false);
});

test('elegirCandidato: acepta el único candidato', () => {
  const r = elegirCandidato(local('Calle Falsa 1'), [cand('A', 'Otra dirección 9')]);
  assert.deepEqual([r.ok, r.candidato.id], [true, 'A']);
});

test('elegirCandidato: con varios, acepta solo el que coincide con la dirección', () => {
  const r = elegirCandidato(local('Calle Falsa 12'), [cand('A', 'Calle Mayor 3, Valencia'), cand('B', 'Calle Falsa, 12, Valencia')]);
  assert.deepEqual([r.ok, r.candidato.id], [true, 'B']);
});

test('elegirCandidato: con varios y ninguno coincide, o coinciden varios, no elige y lista los candidatos', () => {
  const ninguno = elegirCandidato(local('Calle Falsa 12'), [cand('A', 'Calle Mayor 3'), cand('B', 'Plaza Real 5')]);
  assert.equal(ninguno.ok, false);
  assert.match(ninguno.motivo, /ningún candidato coincide/);
  assert.match(ninguno.motivo, /Calle Mayor 3/);
  const varios = elegirCandidato(local('Calle Falsa 12'), [cand('A', 'Calle Falsa, 12, Valencia'), cand('B', 'Calle Falsa 12, Madrid')]);
  assert.equal(varios.ok, false);
  assert.match(varios.motivo, /varios candidatos coinciden/);
});

// Salida
test('construirSalida calcula el resumen y cumpleUmbral aplica el 90%', () => {
  const fichas = Array.from({ length: 10 }, (_, i) => ({ local_id: `l${i}` }));
  const ok = construirSalida({ fichas, fallos: [{ local_id: 'l0', motivo: 'x' }], extraido: '2026-10-14T00:00:00Z' });
  assert.deepEqual(ok.resumen, { locales: 10, resueltos: 9, porcentaje_resuelto: 90 });
  assert.equal(ok.fuente, 'Google Places API (New)');
  assert.equal(cumpleUmbral(ok), true);
  const mal = construirSalida({ fichas, fallos: [{ local_id: 'l0' }, { local_id: 'l1' }], extraido: 'x' });
  assert.equal(mal.resumen.porcentaje_resuelto, 80);
  assert.equal(cumpleUmbral(mal), false);
});

test('construirSalida sin locales no cumple el umbral', () => {
  const vacia = construirSalida({ fichas: [], fallos: [], extraido: 'x' });
  assert.deepEqual(vacia.resumen, { locales: 0, resueltos: 0, porcentaje_resuelto: 0 });
  assert.equal(cumpleUmbral(vacia), false);
});

test('un fallo repetido de un mismo local cuenta una vez', () => {
  const s = construirSalida({ fichas: [{ local_id: 'a' }, { local_id: 'b' }], fallos: [{ local_id: 'a' }, { local_id: 'a' }], extraido: 'x' });
  assert.equal(s.resumen.resueltos, 1);
});
