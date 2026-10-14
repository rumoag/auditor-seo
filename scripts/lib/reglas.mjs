// Reglas de detección (UT-3+4). Funciones puras: no leen ni escriben archivos.
// Principio: un campo "no_disponible" nunca dispara una regla.
import { dominante, esHome, mediana, normalizarUrl, patronNombre, separadorNombre } from './normalizar.mjs';

export const ATRIBUTOS = ['outdoorSeating', 'reservable', 'delivery', 'takeout', 'dineIn'];
const MAPA_WEB_DECLARA = { terraza: 'outdoorSeating', reservas: 'reservable', delivery: 'delivery', accesible: 'accessibilityOptions' };
const UMBRAL_FOTOS = 5;

export const ACCIONES = {
  DESCRIPCION_AUSENTE: 'Redactar descripción de 250-750 caracteres con carta, zona y servicios',
  WEB_AUSENTE: 'Añadir la URL de la página del local',
  TELEFONO_AUSENTE: 'Añadir el teléfono del local',
  ATRIBUTOS_VACIOS: 'Completar los atributos del negocio',
  HORARIO_AUSENTE: 'Definir el horario semanal completo',
  HORARIO_INCOMPLETO: 'Completar los días que faltan en el horario',
  FOTOS_INSUFICIENTES: 'Subir mínimo 10 fotos: fachada, interior, platos destacados',
  NOMENCLATURA_INCONSISTENTE: 'Unificar el nombre con el formato dominante de la marca',
  CATEGORIA_DISPAR: 'Alinear la categoría principal con la de la marca',
  WEB_GENERICA: 'Enlazar la ficha a la página específica del local',
  ATRIBUTO_DESAPROVECHADO: 'Marcar ese atributo en la ficha',
};

export const estadoDe = c => c?.estado ?? 'no_disponible';
const valorDe = c => (c?.estado === 'presente' ? c.valor : undefined);

export const sinDatos = f => estadoDe(f.campos?.nombre) !== 'presente';
export const nombreDe = f => valorDe(f.campos?.nombre) ?? `${f.marca} · ${f.ciudad}`;

// Número de fotos: presente → valor; ausente → 0; no disponible → undefined.
function nFotos(f) {
  const c = f.campos.n_fotos;
  if (estadoDe(c) === 'presente') return c.valor;
  if (estadoDe(c) === 'ausente') return 0;
  return undefined;
}

// Categoría: presente → valor; ausente → 'sin_categoria'; no disponible → undefined.
function categoria(f) {
  const c = f.campos.categoria_principal;
  if (estadoDe(c) === 'presente') return c.valor;
  if (estadoDe(c) === 'ausente') return 'sin_categoria';
  return undefined;
}

const urlWeb = f => normalizarUrl(valorDe(f.campos.web));

// Contexto de grupo y de marca que necesitan las reglas comparativas (R3, R4, R5, R6).
export function construirContexto(fichas) {
  const evaluables = fichas.filter(f => !sinDatos(f));
  const medianaFotos = mediana(evaluables.map(nFotos).filter(n => n !== undefined));
  const noEvaluado = [];
  const marcas = {};

  const porMarca = new Map();
  for (const f of evaluables) {
    if (!porMarca.has(f.marca)) porMarca.set(f.marca, []);
    porMarca.get(f.marca).push(f);
  }

  for (const [marca, ls] of porMarca) {
    const info = { n: ls.length };
    if (ls.length >= 3) {
      const dp = dominante(ls.map(f => patronNombre(nombreDe(f), f.ciudad)));
      const ds = dominante(ls.map(f => separadorNombre(nombreDe(f))));
      if (dp.empate) noEvaluado.push({ regla: 'NOMENCLATURA_INCONSISTENTE', marca, motivo: 'empate en el patrón de nombre dominante' });
      else info.patron = dp.valor;
      if (ds.empate) noEvaluado.push({ regla: 'NOMENCLATURA_INCONSISTENTE', marca, motivo: 'empate en el separador dominante' });
      else info.separador = ds.valor;
      const dc = dominante(ls.map(categoria).filter(c => c !== undefined));
      if (dc.empate) noEvaluado.push({ regla: 'CATEGORIA_DISPAR', marca, motivo: 'empate en la categoría dominante' });
      else info.categoria = dc.valor;
    } else {
      const motivo = `la marca tiene ${ls.length} locales evaluados (mínimo 3)`;
      noEvaluado.push({ regla: 'NOMENCLATURA_INCONSISTENTE', marca, motivo }, { regla: 'CATEGORIA_DISPAR', marca, motivo });
    }
    const webs = ls.map(urlWeb).filter(Boolean);
    info.webIdentica = webs.length === ls.length && ls.length >= 2 && new Set(webs).size === 1 ? webs[0] : undefined;
    marcas[marca] = info;
  }
  return { medianaFotos, marcas, noEvaluado };
}

function hallazgo(f, regla, severidad, evidencia) {
  return { local_id: f.local_id, local: nombreDe(f), marca: f.marca, regla, severidad, evidencia, accion: ACCIONES[regla] };
}

// Evalúa todas las reglas sobre un local con ficha resuelta. Devuelve la lista de hallazgos.
export function evaluarLocal(f, ctx) {
  const c = f.campos;
  const hs = [];
  const info = ctx.marcas[f.marca] ?? { n: 0 };

  // R1: campos ausentes
  if (estadoDe(c.descripcion) === 'ausente') hs.push(hallazgo(f, 'DESCRIPCION_AUSENTE', 'media', 'Sin descripción en la ficha'));
  if (estadoDe(c.web) === 'ausente') hs.push(hallazgo(f, 'WEB_AUSENTE', 'alta', 'Sin sitio web en la ficha'));
  if (estadoDe(c.telefono) === 'ausente') hs.push(hallazgo(f, 'TELEFONO_AUSENTE', 'alta', 'Sin teléfono en la ficha'));
  const vacios = ATRIBUTOS.filter(a => estadoDe(c.atributos?.[a]) === 'ausente');
  if (vacios.length >= 4) hs.push(hallazgo(f, 'ATRIBUTOS_VACIOS', 'baja', `Sin marcar: ${vacios.join(', ')}`));

  // R2: horarios
  if (estadoDe(c.horario_regular) === 'ausente') hs.push(hallazgo(f, 'HORARIO_AUSENTE', 'alta', 'Sin horario regular'));
  else if (estadoDe(c.horario_regular) === 'presente') {
    const dias = Array.isArray(c.horario_regular.valor) ? c.horario_regular.valor.length : 0;
    if (dias < 7) hs.push(hallazgo(f, 'HORARIO_INCOMPLETO', 'media', `Horario con ${dias} de 7 días descritos`));
  }

  // R3: fotos (híbrido: menos de 5, o menos de la mitad de la mediana del grupo)
  const n = nFotos(f);
  if (n !== undefined) {
    const mitad = ctx.medianaFotos !== undefined ? ctx.medianaFotos / 2 : 0;
    if (n === 0 || n < UMBRAL_FOTOS || n < mitad) {
      hs.push(hallazgo(f, 'FOTOS_INSUFICIENTES', n === 0 ? 'alta' : 'media',
        `${n} fotos (mediana del grupo: ${ctx.medianaFotos}; la API devuelve máx. 10)`));
    }
  }

  // R4: nomenclatura (solo si la marca tiene patrón o separador dominante)
  if (info.patron !== undefined || info.separador !== undefined) {
    const nombre = nombreDe(f);
    const patron = patronNombre(nombre, f.ciudad);
    const sep = separadorNombre(nombre);
    const difierePatron = info.patron !== undefined && patron !== info.patron;
    const difiereSep = info.separador !== undefined && sep !== info.separador;
    if (difierePatron || difiereSep) {
      hs.push(hallazgo(f, 'NOMENCLATURA_INCONSISTENTE', 'media',
        `"${nombre}" (patrón más común de ${f.marca}: "${info.patron}", separador "${info.separador}")`));
    }
  }

  // R5: categoría dispar
  const cat = categoria(f);
  if (info.categoria !== undefined && cat !== undefined && cat !== info.categoria) {
    hs.push(hallazgo(f, 'CATEGORIA_DISPAR', 'alta', `Categoría ${cat} (dominante en ${f.marca}: ${info.categoria})`));
  }

  // R6: web genérica (A: toda la marca comparte URL; B: la ficha apunta a la home y hay página específica del local)
  const web = valorDe(c.web);
  if (info.webIdentica && urlWeb(f) === info.webIdentica) {
    hs.push(hallazgo(f, 'WEB_GENERICA', 'media', `Todos los locales de ${f.marca} apuntan a ${info.webIdentica}`));
  } else if (web && esHome(web) && f.web_local) {
    hs.push(hallazgo(f, 'WEB_GENERICA', 'media', `La ficha apunta a la home (${web}) y el local tiene página propia (${f.web_local})`));
  }

  // R7: atributos que la web declara y la ficha no marca
  for (const declarado of f.web_declara ?? []) {
    const attr = MAPA_WEB_DECLARA[declarado];
    if (!attr) continue;
    const campo = c.atributos?.[attr];
    const estado = estadoDe(campo);
    if (estado === 'no_disponible') continue;
    const valor = valorDe(campo);
    const cumple = valor !== null && typeof valor === 'object' ? Object.values(valor).some(Boolean) : Boolean(valor);
    if (estado === 'ausente' || !cumple) {
      const h = hallazgo(f, 'ATRIBUTO_DESAPROVECHADO', 'media',
        `La web declara "${declarado}" pero la ficha ${estado === 'ausente' ? 'no lo marca' : 'lo tiene marcado como no ofrecido'}`);
      hs.push({ ...h, accion: `Marcar el atributo "${declarado}" en la ficha` });
    }
  }

  return hs;
}
