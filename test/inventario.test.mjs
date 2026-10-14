import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asignarIds, compararConOficiales, evaluarEstricto, validarInventario } from '../scripts/lib/inventario.mjs';

const l = (extra = {}) => ({ marca: 'Voltereta', nombre: 'Local ficticio', direccion: 'Calle Falsa 1', ciudad: 'Madrid', verificado: false, ...extra });
const campos = (res, tipo = 'errores') => res[tipo].map(e => e.campo);

test('un local válido no produce errores ni avisos', () => {
  const r = validarInventario([l({ place_id: 'x', url_ficha: 'https://maps.example/x', web_local: 'https://v.example/madrid', web_declara: ['terraza', 'reservas'] })]);
  assert.deepEqual(r, { errores: [], avisos: [] });
});

test('INV-1: campos obligatorios vacíos o ausentes', () => {
  for (const campo of ['marca', 'nombre', 'direccion', 'ciudad']) {
    assert.ok(campos(validarInventario([l({ [campo]: '' })])).includes(campo), campo);
    assert.ok(campos(validarInventario([l({ [campo]: undefined })])).includes(campo), campo);
    assert.ok(campos(validarInventario([l({ [campo]: '   ' })])).includes(campo), campo);
  }
});

test('verificado debe ser booleano', () => {
  assert.ok(campos(validarInventario([l({ verificado: undefined })])).includes('verificado'));
  assert.ok(campos(validarInventario([l({ verificado: 'sí' })])).includes('verificado'));
});

test('INV-2: marca no permitida', () => {
  const r = validarInventario([l({ marca: 'Otra Marca' })]);
  assert.ok(r.errores.some(e => e.campo === 'marca' && /INV-2/.test(e.mensaje)));
});

test('INV-4: web_declara solo admite valores conocidos y debe ser lista', () => {
  assert.ok(validarInventario([l({ web_declara: ['valet'] })]).errores.some(e => /valet/.test(e.mensaje)));
  assert.ok(campos(validarInventario([l({ web_declara: 'terraza' })])).includes('web_declara'));
  assert.deepEqual(validarInventario([l({ web_declara: [] })]).errores, []);
});

test('INV-5: place_id, url_ficha y web_local son opcionales pero las URL deben ser válidas', () => {
  assert.deepEqual(validarInventario([l({ place_id: '', url_ficha: '', web_local: '' })]).errores, []);
  assert.ok(campos(validarInventario([l({ url_ficha: 'no es url' })])).includes('url_ficha'));
  assert.ok(campos(validarInventario([l({ web_local: 'ftp://x.example' })])).includes('web_local'));
});

test('INV-3: la misma marca y dirección es un aviso, no un error', () => {
  const r = validarInventario([l(), l({ nombre: 'Otro nombre', direccion: 'calle  FALSA, 1' })]);
  assert.deepEqual(r.errores, []);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0].mensaje, /duplicado/);
  assert.equal(r.avisos[0].indice, 1);
});

test('la misma dirección en marcas distintas no es duplicado', () => {
  assert.deepEqual(validarInventario([l(), l({ marca: 'Begin' })]).avisos, []);
});

test('una entrada que no es lista o con registros que no son objetos falla con mensaje claro', () => {
  assert.equal(validarInventario({}).errores.length, 1);
  assert.ok(validarInventario([null]).errores.some(e => /objeto/.test(e.mensaje)));
});

test('los errores identifican marca, nombre y campo y no corrigen nada', () => {
  const original = [l({ ciudad: '' })];
  const copia = structuredClone(original);
  const r = validarInventario(original);
  assert.deepEqual(r.errores[0], { indice: 0, marca: 'Voltereta', nombre: 'Local ficticio', campo: 'ciudad', mensaje: 'Campo obligatorio vacío o ausente (INV-1)' });
  assert.deepEqual(original, copia);
});

test('asignarIds: secuencial por marca y ciudad, con acentos y sin colisiones', () => {
  const ids = asignarIds([
    l({ ciudad: 'Málaga' }), l({ ciudad: 'Malaga', nombre: 'b' }), l({ ciudad: 'Madrid' }), l({ marca: 'One Burger', ciudad: 'Madrid' }),
  ]).map(x => x.local_id);
  assert.deepEqual(ids, ['voltereta-malaga-01', 'voltereta-malaga-02', 'voltereta-madrid-01', 'one-burger-madrid-01']);
  assert.equal(new Set(ids).size, ids.length);
});

test('asignarIds no modifica los datos originales', () => {
  const original = [l()];
  asignarIds(original);
  assert.equal(original[0].local_id, undefined);
});

test('compararConOficiales: coincide, faltan, sobran y sin cifra', () => {
  const locales = [l(), l(), l({ marca: 'Begin' }), l({ marca: 'One Burger' })];
  const r = Object.fromEntries(compararConOficiales(locales, {
    Voltereta: { anunciado: 2 }, Begin: { anunciado: 5 }, 'One Burger': { anunciado: 0 },
  }).map(c => [c.marca, c]));
  assert.equal(r.Voltereta.estado, 'coincide');
  assert.deepEqual([r.Begin.estado, r.Begin.diferencia], ['faltan', -4]);
  assert.deepEqual([r['One Burger'].estado, r['One Burger'].diferencia], ['sobran', 1]);
  assert.equal(compararConOficiales(locales, {}).every(c => c.estado === 'sin_cifra'), true);
  assert.equal(compararConOficiales(locales, { Voltereta: { anunciado: null } })[0].estado, 'sin_cifra');
});

test('estricto: falla con locales sin verificar si hay menos de 50', () => {
  const locales = [l({ verificado: true }), l({ verificado: false, direccion: 'Otra' })];
  const comp = compararConOficiales(locales, { Voltereta: { anunciado: 2 }, Begin: { anunciado: 0 }, 'One Burger': { anunciado: 0 } });
  const r = evaluarEstricto(locales, validarInventario(locales), comp);
  assert.equal(r.ok, false);
  assert.match(r.fallos.join(' '), /1 de 2 locales sin verificar/);
});

test('estricto: apto si todos verificados y el recuento coincide', () => {
  const locales = [l({ verificado: true })];
  const comp = compararConOficiales(locales, { Voltereta: { anunciado: 1 }, Begin: { anunciado: 0 }, 'One Burger': { anunciado: 0 } });
  assert.deepEqual(evaluarEstricto(locales, validarInventario(locales), comp), { ok: true, fallos: [], avisos: [] });
});

test('estricto: falla si el recuento no coincide con la cifra oficial', () => {
  const locales = [l({ verificado: true })];
  const comp = compararConOficiales(locales, { Voltereta: { anunciado: 3 }, Begin: { anunciado: 0 }, 'One Burger': { anunciado: 0 } });
  const r = evaluarEstricto(locales, validarInventario(locales), comp);
  assert.equal(r.ok, false);
  assert.match(r.fallos.join(' '), /1 locales frente a 3 anunciados \(faltan 2\)/);
});

test('estricto: sin cifra oficial es aviso, no fallo', () => {
  const locales = [l({ verificado: true })];
  const r = evaluarEstricto(locales, validarInventario(locales), compararConOficiales(locales, {}));
  assert.equal(r.ok, true);
  assert.equal(r.avisos.length, 3);
});

test('estricto: con 50 o más locales los no verificados son aviso con porcentaje', () => {
  const locales = Array.from({ length: 50 }, (_, i) => l({ direccion: `Calle ${i}`, verificado: i < 40 }));
  const comp = compararConOficiales(locales, { Voltereta: { anunciado: 50 }, Begin: { anunciado: 0 }, 'One Burger': { anunciado: 0 } });
  const r = evaluarEstricto(locales, validarInventario(locales), comp);
  assert.equal(r.ok, true);
  assert.match(r.avisos.join(' '), /40 de 50 locales verificados \(80%\)/);
});

test('estricto: un inventario vacío o con errores no es apto', () => {
  assert.equal(evaluarEstricto([], validarInventario([]), compararConOficiales([], {})).ok, false);
  const roto = [l({ ciudad: '' })];
  assert.equal(evaluarEstricto(roto, validarInventario(roto), compararConOficiales(roto, {})).ok, false);
});
