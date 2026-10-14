import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { escanearDirectorio, escanearTexto, esArchivoEnv } from '../scripts/lib/secretos.mjs';

// Las claves de prueba se construyen en tiempo de ejecución para que este archivo no las contenga literalmente.
const claveGoogle = 'AI' + 'za' + 'A'.repeat(35);
const tokenGithub = 'gh' + 'p_' + 'a'.repeat(36);
const script = fileURLToPath(new URL('../scripts/escanear-secretos.mjs', import.meta.url));

async function conTemporal(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'secretos-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('detecta una clave de Google', () => {
  const h = escanearTexto(`const k = "${claveGoogle}";`, 'a.js');
  assert.equal(h.length, 1);
  assert.match(h[0].tipo, /Google/);
  assert.deepEqual([h[0].ruta, h[0].linea], ['a.js', 1]);
});

test('detecta clave de AWS, clave privada y tokens de GitHub', () => {
  assert.match(escanearTexto('AK' + 'IA' + 'ABCDEFGHIJKLMNOP')[0].tipo, /AWS/);
  assert.match(escanearTexto('-----BEGIN ' + 'RSA PRIVATE KEY-----')[0].tipo, /privada/);
  assert.match(escanearTexto(`token=${tokenGithub}`)[0].tipo, /GitHub/);
  assert.match(escanearTexto('github_' + 'pat_' + 'a'.repeat(30))[0].tipo, /GitHub/);
});

test('detecta GOOGLE_PLACES_API_KEY y VERCEL_TOKEN asignados con un valor real', () => {
  assert.equal(escanearTexto('GOOGLE_PLACES_API_KEY=valor-real-12345').length, 1);
  assert.equal(escanearTexto('export GOOGLE_PLACES_API_KEY="valor-real-12345"').length, 1);
  assert.equal(escanearTexto('$env:GOOGLE_PLACES_API_KEY="valor-real-12345"').length, 1);
  assert.equal(escanearTexto('VERCEL_TOKEN=valor-real-12345').length, 1);
});

test('no marca los valores de ejemplo ni la lectura de la variable', () => {
  assert.deepEqual(escanearTexto('export GOOGLE_PLACES_API_KEY=tu_clave'), []);
  assert.deepEqual(escanearTexto('$env:GOOGLE_PLACES_API_KEY="tu_clave"'), []);
  assert.deepEqual(escanearTexto('GOOGLE_PLACES_API_KEY=<tu clave>'), []);
  assert.deepEqual(escanearTexto('GOOGLE_PLACES_API_KEY=...'), []);
  assert.deepEqual(escanearTexto('const apiKey = process.env.GOOGLE_PLACES_API_KEY;'), []);
  assert.deepEqual(escanearTexto("env: { GOOGLE_PLACES_API_KEY: 'clave-ficticia' }"), []);
  assert.deepEqual(escanearTexto('Texto normal con la palabra AIza suelta'), []);
});

test('nunca devuelve el valor completo', () => {
  const [h] = escanearTexto(`k=${claveGoogle}`);
  assert.ok(!h.muestra.includes(claveGoogle));
  assert.ok(!JSON.stringify(h).includes(claveGoogle));
  assert.match(h.muestra, /^AIza… \(39 caracteres\)$/);
  const [t] = escanearTexto(`x=${tokenGithub}`);
  assert.ok(!JSON.stringify(t).includes(tokenGithub));
});

test('esArchivoEnv distingue .env de los ejemplos', () => {
  assert.equal(esArchivoEnv('.env'), true);
  assert.equal(esArchivoEnv('.env.local'), true);
  assert.equal(esArchivoEnv('.env.example'), false);
  assert.equal(esArchivoEnv('env.js'), false);
});

test('escanearDirectorio ignora node_modules y .git y encuentra el resto', () => conTemporal(async dir => {
  await mkdir(join(dir, 'node_modules', 'x'), { recursive: true });
  await mkdir(join(dir, '.git'), { recursive: true });
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'node_modules', 'x', 'a.js'), `k="${claveGoogle}"`);
  await writeFile(join(dir, '.git', 'config'), `k=${claveGoogle}`);
  await writeFile(join(dir, 'src', 'b.js'), `k="${claveGoogle}"`);
  const r = await escanearDirectorio(dir);
  assert.deepEqual(r.hallazgos.map(h => h.ruta), ['src/b.js']);
  assert.equal(r.archivos, 1);
}));

test('un .env con contenido es un hallazgo y uno vacío solo un aviso', () => conTemporal(async dir => {
  await writeFile(join(dir, '.env'), '# comentario\nCLAVE=algo\n');
  assert.deepEqual((await escanearDirectorio(dir)).hallazgos.map(h => [h.tipo, h.ruta]), [['archivo .env con contenido', '.env']]);
  await writeFile(join(dir, '.env'), '# solo comentario\n\n');
  const r = await escanearDirectorio(dir);
  assert.deepEqual(r.hallazgos, []);
  assert.equal(r.avisos.length, 1);
}));

test('un directorio limpio no produce hallazgos', () => conTemporal(async dir => {
  await writeFile(join(dir, 'README.md'), 'export GOOGLE_PLACES_API_KEY=tu_clave\n');
  await writeFile(join(dir, '.env.example'), 'GOOGLE_PLACES_API_KEY=tu_clave\n');
  assert.deepEqual((await escanearDirectorio(dir)).hallazgos, []);
}));

test('el ejecutable sale con 1 si hay una credencial y con 0 si no, sin imprimirla', () => conTemporal(async dir => {
  await writeFile(join(dir, 'a.js'), `k="${claveGoogle}"`);
  const mal = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
  assert.equal(mal.status, 1);
  assert.match(mal.stderr, /POSIBLE CREDENCIAL/);
  assert.ok(!mal.stdout.includes(claveGoogle) && !mal.stderr.includes(claveGoogle));
  await rm(join(dir, 'a.js'));
  await writeFile(join(dir, 'b.js'), 'const x = 1;');
  const bien = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
  assert.equal(bien.status, 0, bien.stderr);
  assert.match(bien.stdout, /Sin credenciales/);
}));
