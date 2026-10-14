// UT-3+4: lee fichas_raw.json (o la ruta indicada), aplica reglas y score y escribe hallazgos.json.
// Uso: node scripts/analyze.mjs [entrada.json] [--out salida.json]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { construirContexto, evaluarLocal, nombreDe, sinDatos } from './lib/reglas.mjs';
import { PESOS, TRAMOS, rankingAcciones, rankingExtension, resumirLocales } from './lib/score.mjs';

// Valida el contrato de entrada; falla con el local_id afectado, nunca en silencio.
export function validarEntrada(raw) {
  if (!raw || !Array.isArray(raw.fichas)) throw new Error('Entrada inválida: falta la lista "fichas".');
  raw.fichas.forEach((f, i) => {
    const id = f?.local_id ?? `#${i}`;
    for (const k of ['local_id', 'marca', 'ciudad']) {
      if (!f?.[k]) throw new Error(`Ficha ${id}: falta el campo "${k}".`);
    }
    if (!f.campos || typeof f.campos !== 'object') throw new Error(`Ficha ${id}: falta el objeto "campos".`);
    for (const [nombre, campo] of Object.entries(f.campos)) {
      if (nombre === 'atributos') continue;
      if (!['presente', 'ausente', 'no_disponible'].includes(campo?.estado)) {
        throw new Error(`Ficha ${id}: el campo "${nombre}" no tiene un estado válido (presente, ausente o no_disponible).`);
      }
    }
  });
}

export function analizar(raw) {
  validarEntrada(raw);
  const fichas = raw.fichas;
  const ctx = construirContexto(fichas);
  const hallazgos = fichas.filter(f => !sinDatos(f)).flatMap(f => evaluarLocal(f, ctx));
  const locales = resumirLocales(
    fichas.map(f => ({ local_id: f.local_id, local: nombreDe(f), marca: f.marca, ciudad: f.ciudad, sin_datos: sinDatos(f) })),
    hallazgos,
  );
  return {
    modo: /ejemplo/i.test(raw.fuente ?? '') ? 'demo' : 'real',
    extraido: raw.extraido ?? null,
    fuente: raw.fuente ?? null,
    pesos: PESOS,
    tramos: TRAMOS,
    hallazgos,
    locales,
    ranking_extension: rankingExtension(hallazgos),
    ranking_acciones: rankingAcciones(hallazgos),
    no_evaluado: ctx.noEvaluado,
    fallos: raw.fallos ?? [],
  };
}

async function main() {
  const args = process.argv.slice(2);
  const iOut = args.indexOf('--out');
  const salida = iOut >= 0 ? args[iOut + 1] : 'data/hallazgos.json';
  const entrada = args.find((a, i) => !a.startsWith('--') && i !== iOut + 1) ?? 'data/fichas_raw.json';

  const resultado = analizar(JSON.parse(await readFile(entrada, 'utf8')));
  await mkdir(dirname(resolve(salida)), { recursive: true });
  await writeFile(salida, JSON.stringify(resultado, null, 2));

  const evaluados = resultado.locales.filter(l => l.estado === 'evaluado');
  const medio = evaluados.length ? Math.round(evaluados.reduce((s, l) => s + l.score, 0) / evaluados.length) : 'n/d';
  console.log(`${resultado.locales.length} locales (${evaluados.length} evaluados) · ${resultado.hallazgos.length} hallazgos · score medio ${medio} · modo ${resultado.modo}`);
  console.log(`Escrito: ${salida}`);
  if (!resultado.hallazgos.some(h => h.severidad !== 'baja')) {
    console.warn('AVISO: no hay hallazgos de severidad alta ni media. Revisar el Plan B del protocolo (§7); no se fuerzan conclusiones.');
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}
