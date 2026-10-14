// Funciones puras de normalización y estadística (UT-3+4).

const SEPARADORES_G = /[-–—|,·]/g;
const SEPARADOR = /[-–—|,·]/;

export const sinAcentos = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function slug(s) {
  return sinAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Nombre en minúsculas, sin acentos, sin la ciudad ni separadores y con espacios colapsados.
export function patronNombre(nombre, ciudad) {
  let t = sinAcentos(nombre).toLowerCase();
  const c = sinAcentos(ciudad).toLowerCase().trim();
  if (c) t = t.replace(new RegExp(`(^|[^a-z0-9])${escapar(c)}(?=$|[^a-z0-9])`, 'g'), ' ');
  return t.replace(SEPARADORES_G, ' ').replace(/\s+/g, ' ').trim();
}

// Primer separador que aparece en el nombre, o "ninguno".
export function separadorNombre(nombre) {
  return String(nombre ?? '').match(SEPARADOR)?.[0] ?? 'ninguno';
}

// host (sin www) + ruta sin barra final; sin protocolo, parámetros ni fragmento. '' si no es una URL válida.
export function normalizarUrl(u) {
  if (!u) return '';
  try {
    const x = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`);
    return x.hostname.toLowerCase().replace(/^www\./, '') + x.pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

// Una URL es la home si, normalizada, es solo el dominio.
export function esHome(u) {
  const n = normalizarUrl(u);
  return n !== '' && !n.includes('/');
}

export function mediana(valores) {
  if (!valores.length) return undefined;
  const s = [...valores].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Valor más frecuente. `empate` es true si dos o más valores comparten el máximo.
export function dominante(valores) {
  const cuenta = new Map();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) || 0) + 1);
  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  if (!orden.length) return { valor: undefined, empate: false };
  return { valor: orden[0][0], empate: orden.length > 1 && orden[1][1] === orden[0][1] };
}
