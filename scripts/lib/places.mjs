// UT-2: cliente mínimo de Google Places API (New). Solo lectura. La clave viaja solo en la cabecera.

const BASE = 'https://places.googleapis.com/v1';

export const MASCARA_DETALLES = [
  'id', 'displayName', 'primaryType', 'types', 'formattedAddress', 'postalAddress', 'nationalPhoneNumber', 'websiteUri',
  'regularOpeningHours', 'currentOpeningHours', 'photos', 'rating', 'userRatingCount', 'editorialSummary',
  'outdoorSeating', 'reservable', 'delivery', 'takeout', 'dineIn', 'accessibilityOptions',
].join(',');
export const MASCARA_BUSQUEDA = 'places.id,places.displayName,places.formattedAddress';

export class ErrorApi extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
  }
}
// Clave inválida o sin permiso: aborta toda la ejecución.
export class ErrorFatalApi extends ErrorApi {
  constructor(mensaje, estado) {
    super(mensaje, estado);
    this.name = 'ErrorFatalApi';
  }
}
// 429 persistente tras los reintentos.
export class CuotaAgotada extends ErrorApi {
  constructor(mensaje) {
    super(mensaje, 429);
    this.name = 'CuotaAgotada';
  }
}

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));

export function crearClientePlaces({ apiKey, fetchFn = globalThis.fetch, dormir = esperar, reintentos = 3, esperaBaseMs = 1000 }) {
  if (!apiKey) throw new Error('Falta la clave de la API (GOOGLE_PLACES_API_KEY).');

  const limpiar = texto => String(texto ?? '').split(apiKey).join('[clave]').replace(/\s+/g, ' ').slice(0, 200);

  async function mensajeDe(res) {
    try {
      const cuerpo = JSON.parse(await res.text());
      return { texto: limpiar(cuerpo?.error?.message), clave: /API_KEY_INVALID/.test(JSON.stringify(cuerpo)) };
    } catch {
      return { texto: '', clave: false };
    }
  }

  async function pedir(url, opciones) {
    for (let intento = 0; ; intento++) {
      let res;
      try {
        res = await fetchFn(url, { ...opciones, headers: { ...opciones.headers, 'X-Goog-Api-Key': apiKey } });
      } catch {
        if (intento < reintentos) {
          await dormir(esperaBaseMs * 2 ** intento);
          continue;
        }
        throw new ErrorApi('Error de red tras los reintentos');
      }
      if (res.ok) return res.json();

      const { texto, clave } = await mensajeDe(res);
      if (res.status === 401 || res.status === 403 || (res.status === 400 && clave)) {
        throw new ErrorFatalApi(`Clave inválida o sin permiso (HTTP ${res.status})${texto ? `: ${texto}` : ''}`, res.status);
      }
      if (res.status === 429 || res.status >= 500) {
        if (intento < reintentos) {
          await dormir(esperaBaseMs * 2 ** intento);
          continue;
        }
        if (res.status === 429) throw new CuotaAgotada('Cuota agotada (HTTP 429) tras los reintentos');
        throw new ErrorApi(`Error del servidor (HTTP ${res.status}) tras los reintentos`, res.status);
      }
      throw new ErrorApi(`HTTP ${res.status}${texto ? `: ${texto}` : ''}`, res.status);
    }
  }

  return {
    async buscarTexto(consulta) {
      const r = await pedir(`${BASE}/places:searchText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-FieldMask': MASCARA_BUSQUEDA },
        body: JSON.stringify({ textQuery: consulta, languageCode: 'es', pageSize: 3 }),
      });
      return r.places ?? [];
    },
    detalles(placeId) {
      return pedir(`${BASE}/places/${encodeURIComponent(placeId)}?languageCode=es`, {
        method: 'GET',
        headers: { 'X-Goog-FieldMask': MASCARA_DETALLES },
      });
    },
  };
}
