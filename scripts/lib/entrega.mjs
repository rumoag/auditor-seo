// UT-6: lista de verificación de la entrega y generación del resumen ejecutivo.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { construirModelo, etiqueta } from './informe.mjs';
import { compararConOficiales, evaluarEstricto, validarInventario } from './inventario.mjs';
import { escanearDirectorio } from './secretos.mjs';

export const HUECOS = [/\[PASO 2/, /\[ENLACE/];
const SECCIONES_README = [['Qué hace', /qué hace/i], ['Cómo se ejecuta', /cómo se ejecuta/i], ['Datos', /datos/i], ['Score', /score/i], ['Limitaciones', /limitaciones/i]];

const leer = async ruta => readFile(ruta, 'utf8').catch(() => null);
const leerJson = async ruta => {
  const t = await leer(ruta);
  try {
    return t === null ? null : JSON.parse(t);
  } catch {
    return undefined;
  }
};
const item = (id, descripcion, estado, evidencia) => ({ id, descripcion, estado, evidencia });

// Devuelve { ok, items }. Estados: ok, fallo (bloquea la entrega) o manual (lo comprueba el usuario).
export async function comprobarEntrega({ raiz = '.' } = {}) {
  const items = [];

  const readme = await leer(join(raiz, 'README.md'));
  if (readme === null) items.push(item('readme', 'README con qué hace, cómo se ejecuta y qué datos usa', 'fallo', 'No existe README.md'));
  else {
    const titulos = readme.split(/\r?\n/).filter(l => /^#{1,3}\s/.test(l)).join('\n');
    const faltan = SECCIONES_README.filter(([, re]) => !re.test(titulos)).map(([n]) => n);
    items.push(faltan.length
      ? item('readme', 'README con qué hace, cómo se ejecuta y qué datos usa', 'fallo', `Faltan secciones: ${faltan.join(', ')}`)
      : item('readme', 'README con qué hace, cómo se ejecuta y qué datos usa', 'ok', 'Contiene todas las secciones obligatorias'));
  }

  const vercel = await leerJson(join(raiz, 'vercel.json'));
  const vercelOk = vercel && vercel.outputDirectory === 'public' && !vercel.buildCommand && !vercel.framework;
  items.push(item('vercel', 'vercel.json sirve public/ sin build', vercelOk ? 'ok' : 'fallo',
    vercelOk ? 'outputDirectory = public, sin build ni framework' : 'vercel.json ausente o no sirve public/ sin build'));

  const html = await leer(join(raiz, 'public', 'index.html'));
  if (html === null) items.push(item('informe', 'public/index.html es el informe real, con fecha y fuente', 'fallo', 'No existe public/index.html'));
  else if (/informe-aviso-demo|DATOS DE EJEMPLO\./.test(html)) {
    items.push(item('informe', 'public/index.html es el informe real, con fecha y fuente', 'fallo', 'El informe está en modo DEMO (datos ficticios)'));
  } else {
    const fecha = html.match(/Fecha de extracción: ([^.<]+)\./)?.[1];
    const fuente = /Fuente: [^.<]+/.test(html);
    items.push(fecha && fecha !== 'no disponible' && fuente
      ? item('informe', 'public/index.html es el informe real, con fecha y fuente', 'ok', `Fecha de extracción ${fecha}`)
      : item('informe', 'public/index.html es el informe real, con fecha y fuente', 'fallo', 'El informe no declara fecha de extracción o fuente'));
  }

  const hallazgos = await leerJson(join(raiz, 'data', 'hallazgos.json'));
  items.push(hallazgos?.modo === 'real'
    ? item('datos', 'hallazgos.json generado con datos reales', 'ok', `Fuente: ${hallazgos.fuente}`)
    : item('datos', 'hallazgos.json generado con datos reales', 'fallo', hallazgos ? `Modo ${hallazgos.modo ?? 'desconocido'}` : 'No existe data/hallazgos.json'));

  const locales = await leerJson(join(raiz, 'data', 'locales.json'));
  if (!Array.isArray(locales)) items.push(item('inventario', 'Inventario verificado y apto', 'fallo', 'No se puede leer data/locales.json'));
  else {
    const cifras = (await leerJson(join(raiz, 'data', 'cifras_oficiales.json'))) ?? {};
    const r = evaluarEstricto(locales, validarInventario(locales), compararConOficiales(locales, cifras));
    items.push(r.ok
      ? item('inventario', 'Inventario verificado y apto', 'ok', `${locales.length} locales verificados`)
      : item('inventario', 'Inventario verificado y apto', 'fallo', r.fallos.join('; ')));
  }

  const { hallazgos: secretos } = await escanearDirectorio(raiz);
  items.push(secretos.length
    ? item('secretos', 'Repositorio sin credenciales', 'fallo', `${secretos.length} posibles credenciales (${[...new Set(secretos.map(s => s.ruta))].join(', ')})`)
    : item('secretos', 'Repositorio sin credenciales', 'ok', 'Sin credenciales detectadas'));

  const fichas = await leer(join(raiz, 'data', 'fichas_raw.json'));
  const gitignore = (await leer(join(raiz, '.gitignore'))) ?? '';
  if (fichas === null) items.push(item('terminos-google', 'Decisión sobre versionar fichas_raw.json (términos de Google, ENT-3)', 'manual', 'fichas_raw.json aún no existe'));
  else if (/fichas_raw/.test(gitignore)) items.push(item('terminos-google', 'Decisión sobre versionar fichas_raw.json (términos de Google, ENT-3)', 'ok', 'fichas_raw.json está ignorado por git'));
  else items.push(item('terminos-google', 'Decisión sobre versionar fichas_raw.json (términos de Google, ENT-3)', 'manual', 'fichas_raw.json se versionaría: confirma que has revisado los términos de Google o añádelo a .gitignore'));

  const resumen = await leer(join(raiz, 'entrega', 'resumen_ejecutivo.md'));
  if (resumen === null) items.push(item('resumen', 'Resumen ejecutivo y mensaje listos', 'fallo', 'No existe entrega/resumen_ejecutivo.md (npm run entrega:resumen)'));
  else if (/DATOS DE EJEMPLO/.test(resumen.split(/\r?\n/)[0] ?? '')) items.push(item('resumen', 'Resumen ejecutivo y mensaje listos', 'fallo', 'El resumen está en modo DEMO'));
  else if (HUECOS.some(re => re.test(resumen))) items.push(item('resumen', 'Resumen ejecutivo y mensaje listos', 'fallo', 'Quedan huecos por rellenar ([PASO 2…] o [ENLACE…])'));
  else items.push(item('resumen', 'Resumen ejecutivo y mensaje listos', 'ok', 'Sin huecos pendientes'));

  items.push(item('enlaces', 'Todos los enlaces funcionan desde una ventana de incógnito', 'manual', 'Lo compruebas tú tras publicar'));
  items.push(item('voz-alta', 'Resumen ejecutivo leído en voz alta: se entiende sin contexto', 'manual', 'Lo compruebas tú'));
  items.push(item('cifras', 'Ninguna cifra sin evidencia detrás', 'manual', 'Todas las cifras del informe salen de hallazgos.json; revísalo antes de enviar'));

  return { ok: !items.some(i => i.estado === 'fallo'), items };
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Texto del resumen ejecutivo y borrador del mensaje, a partir de hallazgos.json. Función pura.
export function generarResumenEjecutivo(h) {
  const m = construirModelo(h);
  const r = m.resumen;
  const principal = m.top[0];
  const lineas = [];
  if (m.modo === 'demo') lineas.push('> DATOS DE EJEMPLO: este texto se ha generado sobre un conjunto ficticio. No lo envíes.', '');
  lineas.push('# Resumen ejecutivo: Auditor de SEO Local', '');
  lineas.push(`**Hallazgo principal:** ${r.frases[0]}`, '');
  lineas.push(`**Cifras:** ${plural(r.nLocales, 'local analizado', 'locales analizados')} · ${plural(r.nHallazgos, 'problema accionable', 'problemas accionables')} · score medio ${r.scoreMedio === null ? 'n/d' : `${r.scoreMedio}/100`}`, '');
  if (r.frases.length > 1) lineas.push(...r.frases.slice(1).map(f => f), '');
  if (m.top.length) {
    lineas.push('**Qué se arregla primero:**');
    m.top.slice(0, 3).forEach((a, i) => lineas.push(`${i + 1}. ${etiqueta(a.regla)} (${plural(a.locales, 'local', 'locales')}): ${a.accion}.`));
    lineas.push('');
  }
  const me = m.metodologia;
  lineas.push(`**Método:** ${me.fuente}, extracción del ${me.fecha}. Solo datos públicos; no se han usado datos internos ni se ha modificado ninguna ficha.`, '');
  lineas.push('**Limitaciones:**', ...me.limitaciones.map(l => `- ${l}`), '');
  lineas.push('---', '', '## Borrador del mensaje', '');
  const hallazgo = principal
    ? `«${etiqueta(principal.regla)}», que afecta a ${principal.locales} de ${plural(r.nEvaluados, 'local evaluado', 'locales evaluados')}`
    : 'que no se han detectado hallazgos relevantes en las fichas públicas';
  lineas.push(`Vi que mencionabais SEO entre los proyectos pendientes, así que monté un auditor de fichas locales este fin de semana con datos públicos. Analiza los ${r.nLocales} locales del grupo y el hallazgo principal es ${hallazgo}. Informe: [ENLACE AL INFORME]. Código: [ENLACE AL REPO].`, '');
  lineas.push('Nada de esto usa datos internos ni toca vuestras fichas: solo lee lo que es público. Si os interesa, lo siguiente natural sería [PASO 2: escríbelo tú].', '');
  return lineas.join('\n');
}
