// UT-2: transformación de la respuesta de Places API (New) al contrato de fichas_raw.json. Funciones puras.
// Estados por campo: presente (la API lo devolvió), ausente (consulta correcta sin ese campo), no_disponible (consulta fallida).
import { sinAcentos } from './normalizar.mjs';

export const FUENTE = 'Google Places API (New)';
export const PORCENTAJE_MINIMO = 90;
export const ATRIBUTOS_BOOLEANOS = ['outdoorSeating', 'reservable', 'delivery', 'takeout', 'dineIn'];

const presente = valor => ({ estado: 'presente', valor });
const ausente = () => ({ estado: 'ausente' });
const noDisponible = () => ({ estado: 'no_disponible' });
const campo = valor => (valor === undefined || valor === null ? ausente() : presente(valor));

export function transformarRespuesta(place) {
  const p = place ?? {};
  const atributos = Object.fromEntries(ATRIBUTOS_BOOLEANOS.map(a => [a, campo(p[a])]));
  atributos.accessibilityOptions = campo(p.accessibilityOptions);
  return {
    nombre: campo(p.displayName?.text),
    categoria_principal: campo(p.primaryType),
    categorias: campo(p.types),
    direccion: campo(p.formattedAddress),
    codigo_postal: campo(p.postalAddress?.postalCode),
    telefono: campo(p.nationalPhoneNumber),
    web: campo(p.websiteUri),
    horario_regular: campo(p.regularOpeningHours?.weekdayDescriptions),
    horario_especial: campo(p.currentOpeningHours?.specialDays),
    n_fotos: Array.isArray(p.photos) ? presente(p.photos.length) : ausente(),
    n_resenas: campo(p.userRatingCount),
    nota: campo(p.rating),
    descripcion: campo(p.editorialSummary?.text),
    atributos,
  };
}

// Todos los campos no disponibles: consulta fallida o local sin resolver.
export function camposNoDisponibles() {
  const atributos = Object.fromEntries([...ATRIBUTOS_BOOLEANOS, 'accessibilityOptions'].map(a => [a, noDisponible()]));
  return {
    nombre: noDisponible(), categoria_principal: noDisponible(), categorias: noDisponible(), direccion: noDisponible(),
    codigo_postal: noDisponible(), telefono: noDisponible(), web: noDisponible(), horario_regular: noDisponible(),
    horario_especial: noDisponible(), n_fotos: noDisponible(), n_resenas: noDisponible(), nota: noDisponible(),
    descripcion: noDisponible(), atributos,
  };
}

const tokens = s => sinAcentos(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const esPalabra = t => /^[a-z]{4,}$/.test(t);

// La dirección de Google coincide con la del inventario si coincide el número de portal (hasta 3 cifras)
// y aparecen al menos la mitad de las palabras de 4 o más letras (comparando los 4 primeros caracteres,
// para tolerar variantes como "Cortes"/"Corts" o "Valencianas"/"Valencianes").
export function direccionCoincide(local, formattedAddress) {
  const inventario = tokens(local.direccion);
  const google = tokens(formattedAddress);
  const palabras = [...new Set(inventario.filter(esPalabra))];
  const numeros = inventario.filter(t => /^\d{1,3}$/.test(t));
  if (numeros.some(n => !google.includes(n))) return false;
  if (!palabras.length) return numeros.length > 0;
  const aciertos = palabras.filter(p => google.some(g => esPalabra(g) && g.slice(0, 4) === p.slice(0, 4))).length;
  return aciertos >= palabras.length / 2;
}

// Acepta el único candidato, o el único cuya dirección coincide; en otro caso, no elige (EXT-3).
export function elegirCandidato(local, candidatos) {
  if (!candidatos?.length) return { ok: false, motivo: 'la búsqueda no devolvió resultados' };
  if (candidatos.length === 1) return { ok: true, candidato: candidatos[0] };
  const coinciden = candidatos.filter(c => direccionCoincide(local, c.formattedAddress));
  if (coinciden.length === 1) return { ok: true, candidato: coinciden[0] };
  const lista = candidatos.map(c => `${c.displayName?.text ?? c.id} (${c.formattedAddress ?? 'sin dirección'})`).join('; ');
  return { ok: false, motivo: `${coinciden.length === 0 ? 'ningún candidato coincide' : 'varios candidatos coinciden'} con la dirección del inventario: ${lista}` };
}

export function construirSalida({ fichas, fallos, extraido }) {
  const locales = fichas.length;
  const resueltos = locales - new Set(fallos.map(f => f.local_id)).size;
  return {
    extraido,
    fuente: FUENTE,
    fichas,
    fallos,
    resumen: { locales, resueltos, porcentaje_resuelto: locales ? Math.round((resueltos / locales) * 1000) / 10 : 0 },
  };
}

// Criterio de aceptación EXT-7.
export const cumpleUmbral = salida => salida.resumen.locales > 0 && salida.resumen.porcentaje_resuelto >= PORCENTAJE_MINIMO;
