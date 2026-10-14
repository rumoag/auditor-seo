import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { generarInforme, validarHallazgos } from '../scripts/report.mjs';

const script = fileURLToPath(new URL('../scripts/report.mjs', import.meta.url));
const minimo = {
  modo: 'real', extraido: null, fuente: 'Google Places API (New)', pesos: { alta: 15, media: 7, baja: 3 }, tramos: { verde: 80, ambar: 50 },
  hallazgos: [], locales: [], ranking_extension: [], ranking_acciones: [], no_evaluado: [], fallos: [],
};

test('generarInforme produce HTML con una entrada mínima válida', () => {
  assert.match(generarInforme(minimo), /<!doctype html>/);
});

test('validarHallazgos falla con mensaje claro si falta una lista o los pesos', () => {
  assert.throws(() => validarHallazgos({}), /"hallazgos"/);
  assert.throws(() => validarHallazgos({ ...minimo, locales: undefined }), /"locales"/);
  assert.throws(() => validarHallazgos({ ...minimo, pesos: undefined }), /pesos/);
});

test('el ejecutable escribe el informe en la ruta indicada', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'informe-'));
  try {
    const entrada = join(dir, 'h.json');
    const salida = join(dir, 'sub', 'i.html');
    await writeFile(entrada, JSON.stringify({ ...minimo, modo: 'demo' }));
    const r = spawnSync(process.execPath, [script, entrada, '--out', salida], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(await readFile(salida, 'utf8'), /DATOS DE EJEMPLO/);
    assert.match(r.stdout, /DEMO/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('el ejecutable falla con un mensaje claro si falta el archivo o está mal formado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'informe-'));
  try {
    const faltante = spawnSync(process.execPath, [script, join(dir, 'no-existe.json'), '--out', join(dir, 'x.html')], { encoding: 'utf8' });
    assert.notEqual(faltante.status, 0);
    assert.match(faltante.stderr, /No se puede leer/);

    const roto = join(dir, 'roto.json');
    await writeFile(roto, JSON.stringify({ foo: 1 }));
    const malo = spawnSync(process.execPath, [script, roto, '--out', join(dir, 'y.html')], { encoding: 'utf8' });
    assert.notEqual(malo.status, 0);
    assert.match(malo.stderr, /Entrada inválida/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
