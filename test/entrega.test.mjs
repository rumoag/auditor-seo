import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { analizar } from '../scripts/analyze.mjs';
import { comprobarEntrega, generarResumenEjecutivo } from '../scripts/lib/entrega.mjs';
import { construirModelo, renderizarHtml } from '../scripts/lib/informe.mjs';
import { PESOS, TRAMOS } from '../scripts/lib/score.mjs';

const app = fileURLToPath(new URL('..', import.meta.url));
const demo = JSON.parse(await readFile(join(app, 'data/fixtures/fichas_demo.json'), 'utf8'));
const hallazgosDemo = analizar(demo);
// Mismos datos, marcados como reales, para simular una entrega válida.
const hallazgosReales = { ...hallazgosDemo, modo: 'real', fuente: 'Google Places API (New)' };

const local = { marca: 'Voltereta', nombre: 'Local', direccion: 'Calle Falsa 1', ciudad: 'Valencia', verificado: true };

// Crea un proyecto de entrega completo y válido en `dir`; `cambios` permite romperlo punto por punto.
async function crearProyecto(dir, cambios = {}) {
  const escribir = async (ruta, contenido) => {
    await mkdir(join(dir, ruta, '..'), { recursive: true });
    await writeFile(join(dir, ruta), contenido);
  };
  const archivos = {
    'README.md': await readFile(join(app, 'README.md'), 'utf8'),
    'vercel.json': JSON.stringify({ buildCommand: null, outputDirectory: 'public', framework: null }),
    'public/index.html': renderizarHtml(construirModelo({ ...hallazgosReales, extraido: '2026-10-14T00:00:00Z' })),
    'data/hallazgos.json': JSON.stringify(hallazgosReales),
    'data/locales.json': JSON.stringify([local]),
    'data/cifras_oficiales.json': JSON.stringify({ Voltereta: { anunciado: 1 }, Begin: { anunciado: 0 }, 'One Burger': { anunciado: 0 } }),
    '.gitignore': 'node_modules/\n.env\nentrega/\n',
    'entrega/resumen_ejecutivo.md': generarResumenEjecutivo(hallazgosReales).replace('[ENLACE AL INFORME]', 'https://ejemplo.invalid/i').replace('[ENLACE AL REPO]', 'https://ejemplo.invalid/r').replace('[PASO 2: escríbelo tú]', 'ampliar el análisis a reseñas'),
    ...cambios,
  };
  for (const [ruta, contenido] of Object.entries(archivos)) if (contenido !== null) await escribir(ruta, contenido);
}

async function conProyecto(cambios, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'entrega-'));
  try {
    await crearProyecto(dir, cambios);
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const estado = (r, id) => r.items.find(i => i.id === id).estado;

test('un proyecto completo y válido no tiene fallos', () => conProyecto({}, async dir => {
  const r = await comprobarEntrega({ raiz: dir });
  assert.deepEqual(r.items.filter(i => i.estado === 'fallo'), []);
  assert.equal(r.ok, true);
  assert.equal(estado(r, 'readme'), 'ok');
  assert.equal(estado(r, 'informe'), 'ok');
}));

test('los puntos manuales del protocolo aparecen siempre como manual', () => conProyecto({}, async dir => {
  const r = await comprobarEntrega({ raiz: dir });
  for (const id of ['enlaces', 'voz-alta', 'cifras']) assert.equal(estado(r, id), 'manual', id);
}));

test('un informe en modo demo en public/ bloquea la entrega', () => conProyecto({ 'public/index.html': renderizarHtml(construirModelo(hallazgosDemo)) }, async dir => {
  const r = await comprobarEntrega({ raiz: dir });
  assert.equal(r.ok, false);
  assert.equal(estado(r, 'informe'), 'fallo');
  assert.match(r.items.find(i => i.id === 'informe').evidencia, /DEMO/);
}));

test('sin public/index.html falla', () => conProyecto({ 'public/index.html': null }, async dir => {
  assert.equal(estado(await comprobarEntrega({ raiz: dir }), 'informe'), 'fallo');
}));

test('un informe sin fecha de extracción falla', () => conProyecto({ 'public/index.html': renderizarHtml(construirModelo({ ...hallazgosReales, extraido: null })) }, async dir => {
  assert.equal(estado(await comprobarEntrega({ raiz: dir }), 'informe'), 'fallo');
}));

test('hallazgos.json en modo demo o ausente falla', async () => {
  await conProyecto({ 'data/hallazgos.json': JSON.stringify(hallazgosDemo) }, async dir => assert.equal(estado(await comprobarEntrega({ raiz: dir }), 'datos'), 'fallo'));
  await conProyecto({ 'data/hallazgos.json': null }, async dir => assert.equal(estado(await comprobarEntrega({ raiz: dir }), 'datos'), 'fallo'));
});

test('vercel.json incorrecto o ausente falla', async () => {
  await conProyecto({ 'vercel.json': JSON.stringify({ outputDirectory: 'dist' }) }, async dir => assert.equal(estado(await comprobarEntrega({ raiz: dir }), 'vercel'), 'fallo'));
  await conProyecto({ 'vercel.json': JSON.stringify({ outputDirectory: 'public', buildCommand: 'npm run build' }) }, async dir => assert.equal(estado(await comprobarEntrega({ raiz: dir }), 'vercel'), 'fallo'));
  await conProyecto({ 'vercel.json': null }, async dir => assert.equal(estado(await comprobarEntrega({ raiz: dir }), 'vercel'), 'fallo'));
});

test('un README al que le falta una sección obligatoria falla y nombra la sección', () => conProyecto({ 'README.md': '# Proyecto\n\n## Qué hace\n\nTexto.\n' }, async dir => {
  const r = await comprobarEntrega({ raiz: dir });
  assert.equal(estado(r, 'readme'), 'fallo');
  assert.match(r.items.find(i => i.id === 'readme').evidencia, /Cómo se ejecuta/);
}));

test('un inventario sin verificar falla', () => conProyecto({ 'data/locales.json': JSON.stringify([{ ...local, verificado: false }]) }, async dir => {
  const r = await comprobarEntrega({ raiz: dir });
  assert.equal(estado(r, 'inventario'), 'fallo');
  assert.match(r.items.find(i => i.id === 'inventario').evidencia, /sin verificar/);
}));

test('una credencial en el proyecto falla sin mostrarla', () => {
  const clave = 'AI' + 'za' + 'B'.repeat(35);
  return conProyecto({ 'scripts/x.js': `const k = "${clave}";` }, async dir => {
    const r = await comprobarEntrega({ raiz: dir });
    assert.equal(estado(r, 'secretos'), 'fallo');
    assert.ok(!JSON.stringify(r).includes(clave));
  });
});

test('fichas_raw.json: ignorado es ok, versionado es una decisión manual, ausente también', async () => {
  await conProyecto({ 'data/fichas_raw.json': '{}', '.gitignore': 'entrega/\ndata/fichas_raw.json\n' }, async dir => assert.equal(estado(await comprobarEntrega({ raiz: dir }), 'terminos-google'), 'ok'));
  await conProyecto({ 'data/fichas_raw.json': '{}' }, async dir => {
    const r = await comprobarEntrega({ raiz: dir });
    assert.equal(estado(r, 'terminos-google'), 'manual');
    assert.match(r.items.find(i => i.id === 'terminos-google').evidencia, /términos de Google/);
  });
  await conProyecto({}, async dir => assert.equal(estado(await comprobarEntrega({ raiz: dir }), 'terminos-google'), 'manual'));
});

test('el resumen con huecos sin rellenar, en demo o ausente falla', async () => {
  const sinRellenar = generarResumenEjecutivo(hallazgosReales);
  await conProyecto({ 'entrega/resumen_ejecutivo.md': sinRellenar }, async dir => {
    const r = await comprobarEntrega({ raiz: dir });
    assert.equal(estado(r, 'resumen'), 'fallo');
    assert.match(r.items.find(i => i.id === 'resumen').evidencia, /huecos/);
  });
  await conProyecto({ 'entrega/resumen_ejecutivo.md': generarResumenEjecutivo(hallazgosDemo) }, async dir => assert.equal(estado(await comprobarEntrega({ raiz: dir }), 'resumen'), 'fallo'));
  await conProyecto({ 'entrega/resumen_ejecutivo.md': null }, async dir => assert.equal(estado(await comprobarEntrega({ raiz: dir }), 'resumen'), 'fallo'));
});

// Resumen ejecutivo
const lineasUtiles = texto => texto.split('\n').filter(l => l.trim() && !l.startsWith('#') && l !== '---');

test('el resumen pone el hallazgo principal antes que el método', () => {
  const t = generarResumenEjecutivo(hallazgosReales);
  assert.match(lineasUtiles(t)[0], /^\*\*Hallazgo principal:\*\* El problema con mayor impacto es «Web genérica»/);
  assert.ok(t.indexOf('Hallazgo principal') < t.indexOf('Método'));
  assert.ok(t.indexOf('Método') < t.indexOf('Borrador del mensaje'));
});

test('el resumen incluye las cifras, el top 3 y las limitaciones', () => {
  const t = generarResumenEjecutivo(hallazgosReales);
  assert.match(t, /7 locales analizados · 14 problemas accionables · score medio 78\/100/);
  assert.equal((t.match(/^\d\. /gm) ?? []).length, 3);
  assert.match(t, /10 fotos/);
  assert.match(t, /solo datos públicos/i);
});

test('el resumen no contiene estimaciones económicas ni "dinero"', () => {
  for (const h of [hallazgosReales, hallazgosDemo, { ...hallazgosReales, hallazgos: [], ranking_acciones: [] }]) {
    assert.doesNotMatch(generarResumenEjecutivo(h), /€|\beuros?\b|dinero|ingresos|facturaci|ventas|pierd/i);
  }
});

test('el borrador del mensaje sigue el orden del protocolo y deja los huecos', () => {
  const t = generarResumenEjecutivo(hallazgosReales);
  const mensaje = t.slice(t.indexOf('## Borrador del mensaje'));
  assert.match(mensaje, /Vi que mencionabais SEO/);
  assert.match(mensaje, /Analiza los 7 locales del grupo y el hallazgo principal es «Web genérica»/);
  assert.match(mensaje, /Nada de esto usa datos internos ni toca vuestras fichas/);
  assert.match(mensaje, /\[ENLACE AL INFORME\]/);
  assert.match(mensaje, /\[ENLACE AL REPO\]/);
  assert.match(mensaje, /\[PASO 2: escríbelo tú\]/);
  assert.ok(mensaje.indexOf('hallazgo principal') < mensaje.indexOf('Nada de esto usa datos internos'));
});

test('en modo demo, la primera línea del resumen lo advierte', () => {
  assert.match(generarResumenEjecutivo(hallazgosDemo).split('\n')[0], /DATOS DE EJEMPLO/);
  assert.doesNotMatch(generarResumenEjecutivo(hallazgosReales).split('\n')[0], /DATOS DE EJEMPLO/);
});

test('sin hallazgos el resumen es honesto y no inventa un problema principal', () => {
  const t = generarResumenEjecutivo({ ...hallazgosReales, hallazgos: [], ranking_acciones: [], ranking_extension: [] });
  assert.match(t, /No se han detectado hallazgos/);
  assert.match(t, /no se han detectado hallazgos relevantes/);
  assert.doesNotMatch(t, /Qué se arregla primero/);
});

// README, backlog y configuración reales del proyecto
test('el README declara los mismos pesos y tramos que el código', async () => {
  const readme = await readFile(join(app, 'README.md'), 'utf8');
  assert.ok(readme.includes(`alta ${PESOS.alta}, media ${PESOS.media}, baja ${PESOS.baja}`));
  assert.ok(readme.includes(`verde ${TRAMOS.verde}-100, ámbar ${TRAMOS.ambar}-${TRAMOS.verde - 1}, rojo 0-${TRAMOS.ambar - 1}`));
});

test('el README cubre las secciones obligatorias y los ejemplos de comandos existen en package.json', async () => {
  const readme = await readFile(join(app, 'README.md'), 'utf8');
  const pkg = JSON.parse(await readFile(join(app, 'package.json'), 'utf8'));
  for (const s of ['## Qué hace', '## Cómo se ejecuta', '## Datos y fuentes', '## Qué se versiona', '## Score y pesos', '## Limitaciones', '## Qué no se hace']) assert.ok(readme.includes(s), s);
  const usados = [...readme.matchAll(/npm run ([\w:-]+)/g)].map(m => m[1]);
  assert.ok(usados.length >= 8);
  for (const u of new Set(usados)) assert.ok(pkg.scripts[u], `README menciona npm run ${u}, que no existe`);
});

test('el README declara las limitaciones conocidas', async () => {
  const readme = await readFile(join(app, 'README.md'), 'utf8');
  for (const frag of [/10 fotos/, /horarios especiales/, /al menos 3 locales/, /reseñas, competencia ni la web corporativa/, /no se modifica nada en fichas reales/i]) assert.match(readme, frag);
});

test('vercel.json real sirve public/ sin build, el backlog existe y .gitignore protege lo sensible', async () => {
  assert.deepEqual(JSON.parse(await readFile(join(app, 'vercel.json'), 'utf8')), { buildCommand: null, outputDirectory: 'public', framework: null });
  assert.match(await readFile(join(app, 'BACKLOG_FUTURO.md'), 'utf8'), /reseñas/i);
  const ig = (await readFile(join(app, '.gitignore'), 'utf8')).split(/\r?\n/);
  for (const linea of ['.env', '.env.*', 'node_modules/', 'entrega/', '.vercel/']) assert.ok(ig.includes(linea), linea);
});

// Ejecutables
const ejecutar = (script, args) => spawnSync(process.execPath, [join(app, 'scripts', script), ...args], { encoding: 'utf8' });

test('comprobar-entrega sale con 1 y lista los fallos; con un proyecto válido sale con 0', async () => {
  await conProyecto({ 'public/index.html': null }, async dir => {
    const r = ejecutar('comprobar-entrega.mjs', [dir]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /\[FALLO\]/);
    assert.match(r.stderr, /NO LISTO/);
  });
  await conProyecto({}, async dir => {
    const r = ejecutar('comprobar-entrega.mjs', [dir]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /\[manual\]/);
  });
});

test('resumen-ejecutivo escribe el archivo y avisa de los huecos; falla con un mensaje claro si falta la entrada', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'resumen-'));
  try {
    const entrada = join(dir, 'h.json');
    await writeFile(entrada, JSON.stringify(hallazgosReales));
    const salida = join(dir, 'entrega', 'r.md');
    const ok = ejecutar('resumen-ejecutivo.mjs', [entrada, '--out', salida]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(await readFile(salida, 'utf8'), /Hallazgo principal/);
    assert.match(ok.stdout, /huecos|\[ENLACE/);
    const mal = ejecutar('resumen-ejecutivo.mjs', [join(dir, 'no-existe.json'), '--out', join(dir, 'x.md')]);
    assert.equal(mal.status, 1);
    assert.match(mal.stderr, /No se puede leer/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
