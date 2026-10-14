import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dominante, esHome, mediana, normalizarUrl, patronNombre, separadorNombre, slug } from '../scripts/lib/normalizar.mjs';

test('patronNombre quita ciudad, separadores, acentos y mayúsculas', () => {
  assert.equal(patronNombre('Marca Alfa - Málaga', 'Malaga'), 'marca alfa');
  assert.equal(patronNombre('MARCA  ALFA | Madrid', 'Madrid'), 'marca alfa');
  assert.equal(patronNombre('Marca Alfa Madrid', 'Madrid'), 'marca alfa');
});

test('patronNombre no corta palabras que contienen la ciudad', () => {
  assert.equal(patronNombre('Madridejos Grill', 'Madrid'), 'madridejos grill');
});

test('separadorNombre devuelve el primer separador o "ninguno"', () => {
  assert.equal(separadorNombre('Marca - Madrid'), '-');
  assert.equal(separadorNombre('Marca | Madrid, Centro'), '|');
  assert.equal(separadorNombre('Marca Madrid'), 'ninguno');
});

test('normalizarUrl ignora protocolo, www, parámetros, fragmento y barra final', () => {
  assert.equal(normalizarUrl('HTTPS://www.Ejemplo.com/Local/?utm=1#x'), 'ejemplo.com/Local');
  assert.equal(normalizarUrl('ejemplo.com/'), 'ejemplo.com');
  assert.equal(normalizarUrl(''), '');
  assert.equal(normalizarUrl(undefined), '');
});

test('esHome es verdadero solo para el dominio sin ruta', () => {
  assert.equal(esHome('https://ejemplo.com/'), true);
  assert.equal(esHome('https://www.ejemplo.com?x=1'), true);
  assert.equal(esHome('https://ejemplo.com/madrid'), false);
  assert.equal(esHome(''), false);
});

test('mediana con cantidad par, impar y vacía', () => {
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([4, 1, 3, 2]), 2.5);
  assert.equal(mediana([]), undefined);
});

test('dominante devuelve el más frecuente y marca el empate', () => {
  assert.deepEqual(dominante(['a', 'a', 'b']), { valor: 'a', empate: false });
  assert.equal(dominante(['a', 'b']).empate, true);
  assert.deepEqual(dominante([]), { valor: undefined, empate: false });
});

test('slug normaliza acentos y símbolos', () => {
  assert.equal(slug('Marca Alfa · Málaga'), 'marca-alfa-malaga');
});
