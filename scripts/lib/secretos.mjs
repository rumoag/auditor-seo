// UT-6: escáner de credenciales (ENT-2). No imprime nunca el valor completo encontrado.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const EXCLUIDOS = new Set(['.git', 'node_modules']);
const TAMANO_MAXIMO = 1_000_000;
const MARCADORES_DE_EJEMPLO = /^(tu[_-]?clave|tu[_-]?token|clave|token|\.{3}|x{3,}|<.*|\$.*|\{.*)$/i;

// Cada patrón devuelve el valor sensible en el grupo 1 (o en el match completo si no hay grupo).
const PATRONES = [
  { tipo: 'clave de Google (AIza…)', re: /AIza[0-9A-Za-z_-]{35}/ },
  { tipo: 'clave de AWS (AKIA…)', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { tipo: 'clave privada', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { tipo: 'token de GitHub', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/ },
  { tipo: 'GOOGLE_PLACES_API_KEY con valor', re: /^\s*(?:export\s+|\$env:)?GOOGLE_PLACES_API_KEY\s*=\s*["']?([^\s"']+)/ },
  { tipo: 'VERCEL_TOKEN con valor', re: /^\s*(?:export\s+|\$env:)?VERCEL_TOKEN\s*=\s*["']?([^\s"']+)/ },
];

const enmascarar = valor => `${valor.slice(0, 4)}… (${valor.length} caracteres)`;

export const esArchivoEnv = nombre => nombre === '.env' || (nombre.startsWith('.env.') && !/\.(example|sample|template)$/.test(nombre));

// Devuelve [{ tipo, ruta, linea, muestra }] para un texto.
export function escanearTexto(texto, ruta = '(texto)') {
  const hallazgos = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    for (const { tipo, re } of PATRONES) {
      const m = linea.match(re);
      if (!m) continue;
      const valor = m[1] ?? m[0];
      if (MARCADORES_DE_EJEMPLO.test(valor)) continue;
      hallazgos.push({ tipo, ruta, linea: i + 1, muestra: enmascarar(valor) });
    }
  });
  return hallazgos;
}

async function* recorrer(dir) {
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    if (EXCLUIDOS.has(entrada.name)) continue;
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) yield* recorrer(ruta);
    else if (entrada.isFile()) yield ruta;
  }
}

// Recorre un directorio. Devuelve { hallazgos, avisos, archivos }.
export async function escanearDirectorio(raiz) {
  const hallazgos = [];
  const avisos = [];
  let archivos = 0;
  for await (const ruta of recorrer(raiz)) {
    const rel = relative(raiz, ruta).split(sep).join('/');
    const nombre = rel.split('/').at(-1);
    if ((await stat(ruta)).size > TAMANO_MAXIMO) continue;
    archivos++;
    const texto = await readFile(ruta, 'utf8').catch(() => '');
    if (esArchivoEnv(nombre)) {
      const contenido = texto.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
      if (contenido.length) hallazgos.push({ tipo: 'archivo .env con contenido', ruta: rel, linea: 1, muestra: `${contenido.length} líneas` });
      else avisos.push(`${rel}: archivo .env presente pero vacío`);
      continue;
    }
    hallazgos.push(...escanearTexto(texto, rel));
  }
  return { hallazgos, avisos, archivos };
}
