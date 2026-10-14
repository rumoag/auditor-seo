// UT-5: modelo del informe y render HTML. Funciones puras, sin dependencias externas.

const ETIQUETAS = {
  WEB_AUSENTE: 'Web ausente',
  TELEFONO_AUSENTE: 'Teléfono ausente',
  ATRIBUTOS_VACIOS: 'Atributos sin marcar',
  HORARIO_AUSENTE: 'Horario ausente',
  HORARIO_INCOMPLETO: 'Horario incompleto',
  FOTOS_INSUFICIENTES: 'Fotos insuficientes',
  NOMENCLATURA_INCONSISTENTE: 'Nombre inconsistente dentro de la marca',
  CATEGORIA_DISPAR: 'Categoría distinta dentro de la marca',
  WEB_GENERICA: 'Web genérica',
  ATRIBUTO_DESAPROVECHADO: 'Atributo declarado en la web pero sin marcar',
};
export const etiqueta = regla => ETIQUETAS[regla] ?? regla;

const TRAMOS_TEXTO = { verde: 'Verde', ambar: 'Ámbar', rojo: 'Rojo' };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function formatearFecha(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('es-ES', { timeZone: 'UTC' }) : 'no disponible';
}

export function construirModelo(h) {
  const locales = h.locales ?? [];
  const hallazgos = h.hallazgos ?? [];
  const evaluados = locales.filter(l => l.estado === 'evaluado');
  const sinDatos = locales.filter(l => l.estado === 'sin_datos');
  const scoreMedio = evaluados.length ? Math.round(evaluados.reduce((s, l) => s + l.score, 0) / evaluados.length) : null;
  const rojos = evaluados.filter(l => l.tramo === 'rojo');
  const ambar = evaluados.filter(l => l.tramo === 'ambar');
  const conHallazgos = evaluados.filter(l => l.n_hallazgos > 0);
  const top = (h.ranking_acciones ?? []).slice(0, 5);
  const principal = top[0] ?? null;
  const peor = evaluados.reduce((p, l) => (p === null || l.score < p.score ? l : p), null);

  const frases = [];
  if (!hallazgos.length) {
    frases.push(`No se han detectado hallazgos en ${plural(evaluados.length, 'local evaluado', 'locales evaluados')}.`);
  } else {
    frases.push(`El problema con mayor impacto es «${etiqueta(principal.regla)}», que afecta a ${principal.locales} de ${plural(evaluados.length, 'local evaluado', 'locales evaluados')}: ${principal.accion}.`);
    frases.push(`${plural(rojos.length, 'local está', 'locales están')} en rojo (score por debajo de ${h.tramos?.ambar ?? 50}) y ${ambar.length} en ámbar; el de menor score es ${peor.local} (${peor.score}).`);
    frases.push(`Se han detectado ${plural(hallazgos.length, 'problema accionable', 'problemas accionables')} en ${conHallazgos.length} de ${plural(evaluados.length, 'local evaluado', 'locales evaluados')}${sinDatos.length ? `; ${plural(sinDatos.length, 'local no se ha podido evaluar', 'locales no se han podido evaluar')}` : ''}.`);
  }

  const limitaciones = [
    'La API de Google Places devuelve como máximo 10 fotos por ficha; la regla de fotos se calibra con ese tope.',
    'No se evalúan los horarios especiales o festivos: la API solo informa de los próximos 7 días y el resultado dependería de la fecha de extracción.',
    'Las reglas de nombre y categoría solo se aplican a marcas con al menos 3 locales evaluados.',
    'Si los nombres de una marca no comparten un patrón común (cada local tiene un nombre propio), la comparación de nombres solo mira el separador.',
    'La API de Google Places no expone la descripción que escribe el propietario de la ficha (solo un resumen editorial de Google), por lo que no se evalúa.',
    'Un dato no disponible nunca se evalúa ni se infiere.',
    'No se han analizado reseñas, competencia ni la web corporativa.',
  ];

  const siguientesPasos = [
    'Repetir la auditoría cada mes para comprobar si las correcciones surten efecto.',
    'Ampliarla con las reseñas públicas, para sumar lo que dicen los clientes.',
    'Con acceso de solo lectura a los perfiles de Google Business, revisar lo que no se ve desde fuera, como la descripción de cada ficha.',
  ];

  return {
    modo: h.modo === 'demo' ? 'demo' : 'real',
    resumen: { nLocales: locales.length, nEvaluados: evaluados.length, nSinDatos: sinDatos.length, nHallazgos: hallazgos.length, scoreMedio, frases },
    top,
    filas: locales,
    detalle: locales.map(l => ({ ...l, hallazgos: hallazgos.filter(x => x.local_id === l.local_id) })),
    metodologia: {
      fuente: h.fuente ?? 'no disponible',
      fecha: formatearFecha(h.extraido),
      pesos: h.pesos ?? {},
      tramos: h.tramos ?? {},
      limitaciones,
      fallos: h.fallos ?? [],
    },
    siguientesPasos,
  };
}

const CSS = `
:root{--bg:#fff;--fg:#1a1a1a;--mut:#555;--card:#f4f4f5;--line:#ddd;--ok:#1b7a3a;--warn:#9a6700;--bad:#b42318;--demo:#fff3cd}
@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--mut:#b5b5b5;--card:#1f1f22;--line:#333;--ok:#4cc277;--warn:#e3b341;--bad:#ff7b72;--demo:#4a3b00}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:960px;margin:0 auto;padding:16px}
h1{margin:.4em 0}h2{margin-top:1.8em;border-bottom:1px solid var(--line);padding-bottom:.2em}
.aviso{background:var(--demo);color:var(--fg);border:1px solid var(--warn);border-radius:6px;padding:8px 12px}
.cifras{display:flex;gap:12px;flex-wrap:wrap;margin:0;padding:0;list-style:none}
.cifras li{flex:1 1 140px;background:var(--card);border-radius:8px;padding:12px}
.cifras b{display:block;font-size:2rem;line-height:1.1}
.mut,small{color:var(--mut)}
.tabla{overflow-x:auto}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th button{all:unset;cursor:pointer;font-weight:700}
th button:focus-visible{outline:2px solid currentColor}
.t-verde{color:var(--ok)}.t-ambar{color:var(--warn)}.t-rojo{color:var(--bad)}.t-verde,.t-ambar,.t-rojo{font-weight:700}
details{border-bottom:1px solid var(--line);padding:6px 0}
summary{cursor:pointer}
ul.hall{margin:.4em 0 .4em 1em;padding:0}
.sev{font-size:.8em;text-transform:uppercase;font-weight:700}
`;

const SCRIPT = `
(function(){
  var tabla=document.querySelector('[data-testid="informe-tabla-locales"] table');
  if(!tabla)return;
  var cuerpo=tabla.tBodies[0];
  tabla.querySelectorAll('th button').forEach(function(b){
    b.addEventListener('click',function(){
      var i=+b.dataset.col,asc=b.dataset.asc!=='1';
      tabla.querySelectorAll('th button').forEach(function(x){x.dataset.asc='0';x.parentNode.removeAttribute('aria-sort')});
      b.dataset.asc=asc?'1':'0';b.parentNode.setAttribute('aria-sort',asc?'ascending':'descending');
      Array.prototype.slice.call(cuerpo.rows).sort(function(x,y){
        var p=x.cells[i].dataset.v,q=y.cells[i].dataset.v;
        if(p===''&&q==='')return 0;if(p==='')return 1;if(q==='')return -1;
        var n=!isNaN(p)&&!isNaN(q);
        return (n?p-q:p.localeCompare(q,'es'))*(asc?1:-1);
      }).forEach(function(r){cuerpo.appendChild(r)});
    });
  });
})();
`;

const COLUMNAS = ['local', 'marca', 'ciudad', 'score', 'tramo', 'problemas'];
const CABECERAS = ['Local', 'Marca', 'Ciudad', 'Score', 'Tramo', 'Problemas'];

function celdaTramo(l) {
  return l.estado === 'sin_datos'
    ? '<td data-v="">sin datos</td>'
    : `<td data-v="${esc(l.tramo)}"><span class="t-${esc(l.tramo)}">${esc(TRAMOS_TEXTO[l.tramo] ?? l.tramo)}</span></td>`;
}

export function renderizarHtml(m) {
  const r = m.resumen;
  const aviso = m.modo === 'demo'
    ? '<p class="aviso" data-testid="informe-aviso-demo"><b>DATOS DE EJEMPLO.</b> Este informe usa un conjunto ficticio para probar el sistema; no refleja ningún local real.</p>'
    : '';

  const cifras = `<ul class="cifras">
<li><b>${r.nLocales}</b>${r.nLocales === 1 ? 'local analizado' : 'locales analizados'}</li>
<li><b>${r.nHallazgos}</b>${r.nHallazgos === 1 ? 'problema accionable' : 'problemas accionables'}</li>
<li><b>${r.scoreMedio === null ? 'n/d' : `${r.scoreMedio}/100`}</b>score medio</li>
</ul>`;

  const top = m.top.length
    ? `<ol>${m.top.map(a => `<li><b>${esc(etiqueta(a.regla))}</b> <small>(${esc(a.regla)})</small> — ${plural(a.locales, 'local', 'locales')}, impacto ${a.impacto}. ${esc(a.accion)}.</li>`).join('')}</ol>`
    : '<p class="mut">No hay acciones que priorizar.</p>';

  const cabecera = CABECERAS.map((c, i) => `<th scope="col"><button type="button" data-col="${i}" data-testid="informe-th-${COLUMNAS[i]}">${c}</button></th>`).join('');
  const filas = m.filas.map(l => `<tr>
<td data-v="${esc(l.local)}">${esc(l.local)}</td><td data-v="${esc(l.marca)}">${esc(l.marca)}</td><td data-v="${esc(l.ciudad)}">${esc(l.ciudad)}</td>
${l.estado === 'sin_datos' ? '<td data-v="">sin datos</td>' : `<td data-v="${l.score}">${l.score}</td>`}${celdaTramo(l)}<td data-v="${l.n_hallazgos}">${l.n_hallazgos}</td>
</tr>`).join('');

  const detalle = m.detalle.filter(l => l.hallazgos.length).map(l => `<details data-testid="informe-detalle-${esc(l.local_id)}">
<summary>${esc(l.local)} — score ${l.score} <span class="t-${esc(l.tramo)}">(${esc(TRAMOS_TEXTO[l.tramo] ?? '')})</span></summary>
<ul class="hall">${l.hallazgos.map(x => `<li><span class="sev">${esc(x.severidad)}</span> <b>${esc(etiqueta(x.regla))}</b>: ${esc(x.evidencia)} → ${esc(x.accion)}</li>`).join('')}</ul>
</details>`).join('\n');

  const me = m.metodologia;
  const pesos = ['alta', 'media', 'baja'].map(k => `${k} ${me.pesos[k] ?? 'n/d'}`).join(', ');
  const fallos = me.fallos.length
    ? `<p>Fallos de extracción (${me.fallos.length}): ${me.fallos.map(f => `${esc(f.local_id)} (${esc(f.motivo)})`).join('; ')}.</p>`
    : '<p>Fallos de extracción: ninguno.</p>';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Auditor de SEO Local</title>
<style>${CSS}</style></head>
<body><main>
<h1>Auditor de SEO Local</h1>
${aviso}
<section data-testid="informe-resumen"><h2>Resumen ejecutivo</h2>
${cifras}
${r.frases.map(f => `<p>${esc(f)}</p>`).join('\n')}
</section>
<section data-testid="informe-top-acciones"><h2>Top 5 acciones</h2>
${top}
</section>
<section data-testid="informe-tabla-locales"><h2>Locales</h2>
<p class="mut"><small>Haz clic en una cabecera para ordenar. Orden inicial: peores primero.</small></p>
<div class="tabla"><table><thead><tr>${cabecera}</tr></thead><tbody>${filas}</tbody></table></div>
</section>
<section data-testid="informe-detalle"><h2>Detalle de hallazgos</h2>
${detalle || '<p class="mut">No hay hallazgos que detallar.</p>'}
</section>
<section data-testid="informe-metodologia"><h2>Metodología y limitaciones</h2>
<p>Fuente: ${esc(me.fuente)}. Fecha de extracción: ${esc(me.fecha)}. Solo datos públicos de las fichas; no se han usado datos internos ni se ha modificado ninguna ficha.</p>
<p>Score = 100 − suma de pesos por hallazgo (${esc(pesos)}), con mínimo 0. Tramos: verde desde ${me.tramos.verde ?? 'n/d'}, ámbar desde ${me.tramos.ambar ?? 'n/d'}, rojo por debajo.</p>
<ul>${me.limitaciones.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
${r.nSinDatos ? `<p>Locales sin datos (no evaluados): ${r.nSinDatos}.</p>` : ''}
${fallos}
</section>
<section data-testid="informe-siguientes-pasos"><h2>Siguientes pasos</h2>
<ul>${m.siguientesPasos.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
</section>
</main>
<script>${SCRIPT}</script>
</body></html>
`;
}
