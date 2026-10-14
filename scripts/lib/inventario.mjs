// UT-1: validación del inventario de locales. Funciones puras; no corrigen datos por inferencia.
import { sinAcentos, slug } from './normalizar.mjs';

export const MARCAS = ['Voltereta', 'Begin', 'One Burger'];
export const WEB_DECLARA_VALIDOS = ['terraza', 'reservas', 'delivery', 'accesible'];
const OBLIGATORIOS = ['marca', 'nombre', 'direccion', 'ciudad'];
const URLS_OPCIONALES = ['url_ficha', 'web_local'];
const LIMITE_VERIFICACION_INDIVIDUAL = 50;

const vacio = v => typeof v !== 'string' || v.trim() === '';

function esUrlHttp(v) {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol);
  } catch {
    return false;
  }
}

const claveDireccion = l => `${l.marca}|${sinAcentos(l.direccion).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;

// Devuelve { errores, avisos }. Cada elemento: { indice, marca, nombre, campo, mensaje }.
export function validarInventario(locales) {
  const errores = [];
  const avisos = [];
  if (!Array.isArray(locales)) {
    return { errores: [{ indice: -1, marca: '', nombre: '', campo: '(raíz)', mensaje: 'El inventario debe ser una lista de locales' }], avisos };
  }
  const registro = (lista, i, l, campo, mensaje) => lista.push({ indice: i, marca: l?.marca ?? '', nombre: l?.nombre ?? '', campo, mensaje });

  const vistas = new Map();
  locales.forEach((l, i) => {
    if (!l || typeof l !== 'object') return registro(errores, i, {}, '(registro)', 'El registro no es un objeto');
    for (const campo of OBLIGATORIOS) {
      if (vacio(l[campo])) registro(errores, i, l, campo, 'Campo obligatorio vacío o ausente (INV-1)');
    }
    if (!vacio(l.marca) && !MARCAS.includes(l.marca)) {
      registro(errores, i, l, 'marca', `Marca no permitida (${MARCAS.join(', ')}) (INV-2)`);
    }
    if (typeof l.verificado !== 'boolean') registro(errores, i, l, 'verificado', 'Debe ser true o false');
    if (l.web_declara !== undefined) {
      if (!Array.isArray(l.web_declara)) registro(errores, i, l, 'web_declara', 'Debe ser una lista (INV-4)');
      else {
        for (const v of l.web_declara) {
          if (!WEB_DECLARA_VALIDOS.includes(v)) registro(errores, i, l, 'web_declara', `Valor no permitido "${v}" (${WEB_DECLARA_VALIDOS.join(', ')}) (INV-4)`);
        }
      }
    }
    if (l.place_id !== undefined && l.place_id !== '' && typeof l.place_id !== 'string') registro(errores, i, l, 'place_id', 'Debe ser texto (INV-5)');
    for (const campo of URLS_OPCIONALES) {
      if (!vacio(l[campo]) && !esUrlHttp(l[campo])) registro(errores, i, l, campo, 'URL no válida; debe empezar por http:// o https:// (INV-5)');
    }
    if (!vacio(l.marca) && !vacio(l.direccion)) {
      const clave = claveDireccion(l);
      if (vistas.has(clave)) registro(avisos, i, l, 'direccion', `Posible duplicado del registro ${vistas.get(clave)} (misma marca y dirección) (INV-3)`);
      else vistas.set(clave, i);
    }
  });
  return { errores, avisos };
}

// Añade local_id = slug(marca)-slug(ciudad)-NN, secuencial por marca y ciudad en el orden de la lista.
export function asignarIds(locales) {
  const contador = new Map();
  return locales.map(l => {
    const base = `${slug(l.marca)}-${slug(l.ciudad)}`;
    const n = (contador.get(base) ?? 0) + 1;
    contador.set(base, n);
    return { ...l, local_id: `${base}-${String(n).padStart(2, '0')}` };
  });
}

// Recuento por marca frente a la cifra anunciada. cifras: { [marca]: { anunciado: number|null, fuente, consultado } }.
export function compararConOficiales(locales, cifras = {}) {
  return MARCAS.map(marca => {
    const encontrados = locales.filter(l => l?.marca === marca).length;
    const anunciado = cifras?.[marca]?.anunciado ?? null;
    if (anunciado === null) return { marca, encontrados, anunciado: null, estado: 'sin_cifra', diferencia: null };
    const diferencia = encontrados - anunciado;
    return { marca, encontrados, anunciado, estado: diferencia === 0 ? 'coincide' : diferencia < 0 ? 'faltan' : 'sobran', diferencia };
  });
}

// Criterio para ejecutar con datos reales (INV-6). Devuelve { ok, fallos, avisos }.
export function evaluarEstricto(locales, validacion, comparacion) {
  const fallos = [];
  const avisos = [];
  if (!Array.isArray(locales) || locales.length === 0) fallos.push('El inventario está vacío');
  if (validacion.errores.length) fallos.push(`${validacion.errores.length} errores de validación`);
  for (const c of comparacion) {
    if (c.estado === 'faltan' || c.estado === 'sobran') fallos.push(`${c.marca}: ${c.encontrados} locales frente a ${c.anunciado} anunciados (${c.estado} ${Math.abs(c.diferencia)})`);
    if (c.estado === 'sin_cifra') avisos.push(`${c.marca}: sin cifra oficial publicada; el recuento debe contrastarse a mano`);
  }
  const total = Array.isArray(locales) ? locales.length : 0;
  const sinVerificar = Array.isArray(locales) ? locales.filter(l => l?.verificado !== true).length : 0;
  if (total < LIMITE_VERIFICACION_INDIVIDUAL) {
    if (sinVerificar > 0) fallos.push(`${sinVerificar} de ${total} locales sin verificar (con menos de ${LIMITE_VERIFICACION_INDIVIDUAL} locales deben estar todos verificados)`);
  } else if (sinVerificar > 0) {
    avisos.push(`${total - sinVerificar} de ${total} locales verificados (${Math.round(((total - sinVerificar) / total) * 100)}%)`);
  }
  return { ok: fallos.length === 0, fallos, avisos };
}
