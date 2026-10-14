// Apoyo para las pruebas: construye locales ficticios con el contrato de fichas_raw.json.
export const P = valor => ({ estado: 'presente', valor });
export const A = () => ({ estado: 'ausente' });
export const N = () => ({ estado: 'no_disponible' });

const SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'].map(d => `${d}: 13:00-23:00`);

export function camposCompletos(nombre) {
  return {
    nombre: P(nombre),
    categoria_principal: P('restaurant'),
    categorias: P(['restaurant']),
    direccion: P('Calle Ficticia 1'),
    codigo_postal: P('00000'),
    telefono: P('900 000 000'),
    web: P('https://ficticia.example/local'),
    horario_regular: P(SEMANA),
    horario_especial: A(),
    n_fotos: P(10),
    n_resenas: P(100),
    nota: P(4.5),
    descripcion: P('Descripción ficticia'),
    atributos: {
      outdoorSeating: P(true),
      reservable: P(true),
      delivery: P(true),
      takeout: P(true),
      dineIn: P(true),
      accessibilityOptions: P({ wheelchairAccessibleEntrance: true }),
    },
  };
}

// Local completo y sin problemas; `campos` y `extra` sobrescriben.
export function local(marca, ciudad, campos = {}, extra = {}) {
  const id = `${marca}-${ciudad}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    local_id: id,
    marca,
    ciudad,
    place_id: 'ficticio',
    web_declara: [],
    ...extra,
    campos: { ...camposCompletos(`${marca} - ${ciudad}`), ...campos },
  };
}

// Local con la ficha sin resolver.
export function localSinDatos(marca, ciudad) {
  const campos = Object.fromEntries(Object.keys(camposCompletos('x')).map(k => [k, N()]));
  campos.atributos = {};
  return { local_id: `${marca}-${ciudad}`.toLowerCase(), marca, ciudad, place_id: 'ficticio', web_declara: [], campos };
}

// Respuesta ficticia y completa de Places API (New), para las pruebas de UT-2.
export const placeCompleto = () => ({
  id: 'ABC123',
  displayName: { text: 'Local Ficticio' },
  primaryType: 'restaurant',
  types: ['restaurant', 'food'],
  formattedAddress: 'Av. de les Corts Valencianes, 26, 46015 València, España',
  postalAddress: { postalCode: '46015' },
  nationalPhoneNumber: '960 00 00 00',
  websiteUri: 'https://ficticio.example/local',
  regularOpeningHours: { weekdayDescriptions: ['lunes: 13:00-23:00', 'martes: 13:00-23:00', 'miércoles: 13:00-23:00', 'jueves: 13:00-23:00', 'viernes: 13:00-23:00', 'sábado: 13:00-23:00', 'domingo: 13:00-23:00'] },
  currentOpeningHours: { specialDays: [{ date: { year: 2026, month: 10, day: 12 } }] },
  photos: [{}, {}, {}],
  rating: 4.4,
  userRatingCount: 120,
  editorialSummary: { text: 'Descripción ficticia' },
  outdoorSeating: true, reservable: true, delivery: false, takeout: true, dineIn: true,
  accessibilityOptions: { wheelchairAccessibleEntrance: true },
});
