import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { analizar } from '../scripts/analyze.mjs';
import { construirModelo, esc, renderizarHtml } from '../scripts/lib/informe.mjs';

const demo = JSON.parse(await readFile(new URL('../data/fixtures/fichas_demo.json', import.meta.url), 'utf8'));
const hallazgosDemo = analizar(demo);
const html = renderizarHtml(construirModelo(hallazgosDemo));

const vacio = (extra = {}) => ({
  modo: 'real', extraido: '2026-10-14T00:00:00Z', fuente: 'Google Places API (New)',
  pesos: { alta: 15, media: 7, baja: 3 }, tramos: { verde: 80, ambar: 50 },
  hallazgos: [], locales: [], ranking_extension: [], ranking_acciones: [], no_evaluado: [], fallos: [], ...extra,
});

test('el resumen coincide con los datos', () => {
  const m = construirModelo(hallazgosDemo);
  assert.equal(m.resumen.nLocales, 7);
  assert.equal(m.resumen.nEvaluados, 6);
  assert.equal(m.resumen.nSinDatos, 1);
  assert.equal(m.resumen.nHallazgos, hallazgosDemo.hallazgos.length);
  const scores = hallazgosDemo.locales.filter(l => l.estado === 'evaluado').map(l => l.score);
  assert.equal(m.resumen.scoreMedio, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));
  assert.equal(m.resumen.frases.length, 3);
});

test('la primera frase del resumen nombra el problema principal', () => {
  const m = construirModelo(hallazgosDemo);
  assert.match(m.resumen.frases[0], /Web genérica/);
});

test('el top 5 tiene como máximo 5 acciones y respeta el orden', () => {
  const m = construirModelo(hallazgosDemo);
  assert.equal(m.top.length, 5);
  assert.deepEqual(m.top.map(a => a.regla), hallazgosDemo.ranking_acciones.slice(0, 5).map(a => a.regla));
});

test('el aviso de datos de ejemplo aparece solo en modo demo', () => {
  assert.equal(hallazgosDemo.modo, 'demo');
  assert.match(html, /data-testid="informe-aviso-demo"/);
  assert.match(html, /DATOS DE EJEMPLO/);
  const real = renderizarHtml(construirModelo({ ...hallazgosDemo, modo: 'real' }));
  assert.doesNotMatch(real, /informe-aviso-demo/);
  assert.doesNotMatch(real, /DATOS DE EJEMPLO\./);
});

test('un local sin datos aparece como "sin datos" y no entra en el score medio', () => {
  assert.match(html, /<td data-v="">sin datos<\/td>/);
  const m = construirModelo(hallazgosDemo);
  assert.equal(m.resumen.nEvaluados + m.resumen.nSinDatos, m.resumen.nLocales);
});

test('sin hallazgos: mensaje honesto y sin top 5', () => {
  const m = construirModelo(vacio({ locales: [{ local_id: 'a', local: 'A', marca: 'M', ciudad: 'c', estado: 'evaluado', score: 100, tramo: 'verde', n_hallazgos: 0 }] }));
  assert.match(m.resumen.frases[0], /No se han detectado hallazgos/);
  assert.equal(m.resumen.frases.length, 1);
  const out = renderizarHtml(m);
  assert.match(out, /No hay acciones que priorizar/);
  assert.match(out, /No hay hallazgos que detallar/);
});

test('sin ningún local el informe se genera sin fallar', () => {
  const out = renderizarHtml(construirModelo(vacio()));
  assert.match(out, /0<\/b>locales analizados/);
  assert.match(out, /n\/d<\/b>score medio/);
});

test('esc neutraliza caracteres peligrosos', () => {
  assert.equal(esc('<script>alert("x")</script> & \'y\''), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
});

test('el texto procedente de los datos se escapa en el HTML', () => {
  const peligroso = '<img src=x onerror=alert(1)>';
  const h = vacio({
    locales: [{ local_id: 'a"b', local: peligroso, marca: peligroso, ciudad: peligroso, estado: 'evaluado', score: 90, tramo: 'verde', n_hallazgos: 1 }],
    hallazgos: [{ local_id: 'a"b', local: peligroso, marca: 'M', regla: 'WEB_AUSENTE', severidad: 'alta', evidencia: peligroso, accion: peligroso }],
    ranking_acciones: [{ regla: peligroso, locales: 1, impacto: 15, accion: peligroso }],
    fallos: [{ local_id: peligroso, motivo: peligroso }],
  });
  const out = renderizarHtml(construirModelo(h));
  assert.doesNotMatch(out, /<img src=x/);
  assert.doesNotMatch(out, /data-testid="informe-detalle-a"b"/);
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('el informe es autocontenido: sin recursos externos', () => {
  assert.doesNotMatch(html, /<link\b/i);
  assert.doesNotMatch(html, /<script[^>]*\ssrc=/i);
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /\b(?:src|href)=["']?https?:/i);
  assert.doesNotMatch(html, /@import|url\(/i);
});

test('la metodología declara fuente, fecha, pesos, tope de fotos, horarios especiales y fallos', () => {
  const sec = html.slice(html.indexOf('informe-metodologia'));
  assert.match(sec, /DATOS DE EJEMPLO \(ficticios\)/);
  assert.match(sec, /14\/10\/2026/);
  assert.match(sec, /alta 15, media 7, baja 3/);
  assert.match(sec, /10 fotos/);
  assert.match(sec, /horarios especiales/);
  assert.match(sec, /no expone la descripción que escribe el propietario/);
  assert.match(sec, /Fallos de extracción \(1\)/);
  assert.match(sec, /Reglas no evaluadas/);
  assert.match(sec, /reseñas, competencia ni la web corporativa/);
});

test('la tabla incluye los data-testid y el orden inicial es peores primero', () => {
  for (const t of ['informe-resumen', 'informe-top-acciones', 'informe-tabla-locales', 'informe-metodologia', 'informe-th-score', 'informe-th-local']) {
    assert.match(html, new RegExp(`data-testid="${t}"`), t);
  }
  assert.match(html, /data-testid="informe-detalle-marca-alfa-barcelona"/);
  const posPeor = html.indexOf('Marca Alfa Barcelona</td>');
  const posMejor = html.indexOf('Beta Grill</td>');
  assert.ok(posPeor > 0 && posMejor > posPeor);
});

test('el tramo se indica con texto además de con color', () => {
  assert.match(html, /<span class="t-rojo">Rojo<\/span>/);
  assert.match(html, /<span class="t-verde">Verde<\/span>/);
});

test('la página declara idioma español y viewport', () => {
  assert.match(html, /<html lang="es">/);
  assert.match(html, /name="viewport"/);
});
