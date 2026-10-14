import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearClientePlaces, CuotaAgotada, ErrorApi, ErrorFatalApi, MASCARA_DETALLES } from '../scripts/lib/places.mjs';

const CLAVE = 'CLAVE-SECRETA-FICTICIA-123';

const respuesta = (estado, cuerpo = {}) => ({
  ok: estado >= 200 && estado < 300,
  status: estado,
  json: async () => cuerpo,
  text: async () => JSON.stringify(cuerpo),
});

// Cliente con una secuencia de respuestas (o errores) y registro de llamadas y esperas.
function montar(secuencia, opciones = {}) {
  const llamadas = [];
  const esperas = [];
  const fetchFn = async (url, init) => {
    llamadas.push({ url, init });
    const siguiente = secuencia[Math.min(llamadas.length - 1, secuencia.length - 1)];
    if (siguiente instanceof Error) throw siguiente;
    return siguiente;
  };
  const cliente = crearClientePlaces({ apiKey: CLAVE, fetchFn, dormir: async ms => esperas.push(ms), ...opciones });
  return { cliente, llamadas, esperas };
}

test('sin clave no se crea el cliente', () => {
  assert.throws(() => crearClientePlaces({ apiKey: '' }), /clave/i);
});

test('detalles: GET con la máscara de campos y la clave solo en la cabecera', async () => {
  const { cliente, llamadas } = montar([respuesta(200, { id: 'ABC' })]);
  assert.deepEqual(await cliente.detalles('ABC'), { id: 'ABC' });
  const { url, init } = llamadas[0];
  assert.equal(url, 'https://places.googleapis.com/v1/places/ABC?languageCode=es');
  assert.equal(init.method, 'GET');
  assert.equal(init.headers['X-Goog-FieldMask'], MASCARA_DETALLES);
  assert.equal(init.headers['X-Goog-Api-Key'], CLAVE);
  assert.ok(!url.includes(CLAVE));
});

test('buscarTexto: POST con hasta 3 resultados y devuelve la lista (o vacía)', async () => {
  const a = montar([respuesta(200, { places: [{ id: 'A' }] })]);
  assert.deepEqual(await a.cliente.buscarTexto('local ciudad'), [{ id: 'A' }]);
  const cuerpo = JSON.parse(a.llamadas[0].init.body);
  assert.deepEqual(cuerpo, { textQuery: 'local ciudad', languageCode: 'es', pageSize: 3 });
  assert.equal(a.llamadas[0].init.method, 'POST');
  assert.deepEqual(await montar([respuesta(200, {})]).cliente.buscarTexto('x'), []);
});

test('reintenta con espera creciente ante 500 y tiene éxito', async () => {
  const { cliente, llamadas, esperas } = montar([respuesta(500), respuesta(503), respuesta(200, { id: 'OK' })]);
  assert.deepEqual(await cliente.detalles('X'), { id: 'OK' });
  assert.equal(llamadas.length, 3);
  assert.deepEqual(esperas, [1000, 2000]);
});

test('reintenta ante un error de red y tiene éxito', async () => {
  const { cliente, llamadas, esperas } = montar([new Error('ECONNRESET'), respuesta(200, { id: 'OK' })]);
  assert.deepEqual(await cliente.detalles('X'), { id: 'OK' });
  assert.equal(llamadas.length, 2);
  assert.deepEqual(esperas, [1000]);
});

test('un error de red persistente falla tras 3 reintentos con espera 1, 2 y 4 s', async () => {
  const { cliente, llamadas, esperas } = montar([new Error('ECONNRESET')]);
  await assert.rejects(cliente.detalles('X'), e => e instanceof ErrorApi && /red/.test(e.message));
  assert.equal(llamadas.length, 4);
  assert.deepEqual(esperas, [1000, 2000, 4000]);
});

test('no reintenta ante un 404', async () => {
  const { cliente, llamadas, esperas } = montar([respuesta(404, { error: { message: 'No encontrado' } })]);
  await assert.rejects(cliente.detalles('X'), e => e instanceof ErrorApi && !(e instanceof ErrorFatalApi) && e.estado === 404);
  assert.equal(llamadas.length, 1);
  assert.deepEqual(esperas, []);
});

test('403 y API_KEY_INVALID son fatales y no se reintentan', async () => {
  const a = montar([respuesta(403, { error: { message: 'Sin permiso' } })]);
  await assert.rejects(a.cliente.detalles('X'), ErrorFatalApi);
  assert.equal(a.llamadas.length, 1);
  const b = montar([respuesta(400, { error: { message: 'API key not valid', details: [{ reason: 'API_KEY_INVALID' }] } })]);
  await assert.rejects(b.cliente.detalles('X'), ErrorFatalApi);
  assert.equal(b.llamadas.length, 1);
  const c = montar([respuesta(401)]);
  await assert.rejects(c.cliente.detalles('X'), ErrorFatalApi);
});

test('un 400 que no es de clave no es fatal', async () => {
  const { cliente } = montar([respuesta(400, { error: { message: 'Campo inválido' } })]);
  await assert.rejects(cliente.detalles('X'), e => e instanceof ErrorApi && !(e instanceof ErrorFatalApi));
});

test('un 429 persistente lanza CuotaAgotada tras los reintentos', async () => {
  const { cliente, llamadas } = montar([respuesta(429)]);
  await assert.rejects(cliente.detalles('X'), CuotaAgotada);
  assert.equal(llamadas.length, 4);
});

test('un 429 que se recupera no es un error', async () => {
  const { cliente } = montar([respuesta(429), respuesta(200, { id: 'OK' })]);
  assert.deepEqual(await cliente.detalles('X'), { id: 'OK' });
});

test('un 5xx persistente es un ErrorApi, no cuota ni fatal', async () => {
  const { cliente } = montar([respuesta(503)]);
  await assert.rejects(cliente.detalles('X'), e => e instanceof ErrorApi && !(e instanceof CuotaAgotada) && !(e instanceof ErrorFatalApi));
});

test('la clave no aparece en ningún mensaje de error, ni aunque el servidor la devuelva', async () => {
  const casos = [
    [respuesta(403, { error: { message: `La clave ${CLAVE} no tiene permiso` } })],
    [respuesta(404, { error: { message: `Recurso ${CLAVE} inexistente` } })],
    [respuesta(429)],
    [respuesta(503)],
    [new Error(`fallo con ${CLAVE}`)],
  ];
  for (const secuencia of casos) {
    const { cliente } = montar(secuencia);
    await assert.rejects(cliente.detalles('X'), e => {
      assert.ok(!String(e.message).includes(CLAVE), e.message);
      return true;
    });
  }
});

test('un cuerpo de error que no es JSON no rompe el cliente', async () => {
  const res = { ok: false, status: 404, json: async () => { throw new Error('x'); }, text: async () => '<html>no json</html>' };
  const { cliente } = montar([res]);
  await assert.rejects(cliente.detalles('X'), e => e instanceof ErrorApi && e.estado === 404);
});
