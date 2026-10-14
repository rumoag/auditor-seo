// Score por local y rankings (UT-3+4). Funciones puras.

export const PESOS = { alta: 15, media: 7, baja: 3 };
export const TRAMOS = { verde: 80, ambar: 50 };

export const calcularScore = hallazgos => Math.max(0, 100 - hallazgos.reduce((s, h) => s + PESOS[h.severidad], 0));

export const tramoDe = score => (score >= TRAMOS.verde ? 'verde' : score >= TRAMOS.ambar ? 'ambar' : 'rojo');

// locales: [{ local_id, local, marca, ciudad, sin_datos }]. Orden: peores primero; los sin datos al final.
export function resumirLocales(locales, hallazgos) {
  const filas = locales.map(l => {
    const hs = hallazgos.filter(h => h.local_id === l.local_id);
    if (l.sin_datos) {
      return { local_id: l.local_id, local: l.local, marca: l.marca, ciudad: l.ciudad, estado: 'sin_datos', score: null, tramo: null, n_hallazgos: 0 };
    }
    const score = calcularScore(hs);
    return { local_id: l.local_id, local: l.local, marca: l.marca, ciudad: l.ciudad, estado: 'evaluado', score, tramo: tramoDe(score), n_hallazgos: hs.length };
  });
  return filas.sort((a, b) => {
    if ((a.estado === 'sin_datos') !== (b.estado === 'sin_datos')) return a.estado === 'sin_datos' ? 1 : -1;
    if (a.estado === 'sin_datos') return a.local.localeCompare(b.local);
    return a.score - b.score || b.n_hallazgos - a.n_hallazgos || a.local.localeCompare(b.local);
  });
}

function porRegla(hallazgos) {
  const reglas = new Map();
  for (const h of hallazgos) {
    const r = reglas.get(h.regla) ?? { regla: h.regla, locales: new Set(), impacto: 0, accion: h.accion };
    r.locales.add(h.local_id);
    r.impacto += PESOS[h.severidad];
    reglas.set(h.regla, r);
  }
  return [...reglas.values()].map(r => ({ regla: r.regla, locales: r.locales.size, impacto: r.impacto, accion: r.accion }));
}

// Problema más extendido: por locales afectados; desempate por impacto.
export const rankingExtension = hallazgos =>
  porRegla(hallazgos).sort((a, b) => b.locales - a.locales || b.impacto - a.impacto || a.regla.localeCompare(b.regla));

// Acciones prioritarias: por impacto agregado; desempate por locales afectados.
export const rankingAcciones = hallazgos =>
  porRegla(hallazgos).sort((a, b) => b.impacto - a.impacto || b.locales - a.locales || a.regla.localeCompare(b.regla));
