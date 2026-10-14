# Auditor de SEO Local

Audita de forma sistemática las fichas públicas de Google Business de los locales de Voltereta, Begin y One Burger, detecta carencias e inconsistencias, puntúa cada local y genera un informe estático (`public/index.html`).

Proyecto independiente y de solo lectura, construido con datos públicos. No está encargado por las marcas ni afiliado a ellas.

## Qué hace

1. **Inventario**: lista de locales (`data/locales.json`) tomada de las webs oficiales y verificada a mano.
2. **Extracción**: lee los datos públicos de cada ficha con la API oficial de Google Places (`data/fichas_raw.json`).
3. **Reglas y score**: detecta problemas con evidencia y acción concreta (`data/hallazgos.json`) y puntúa cada local de 0 a 100.
4. **Informe**: una página HTML autocontenida con resumen ejecutivo, top 5 acciones, tabla ordenable, detalle y metodología.

## Cómo se ejecuta

Requisitos: Node.js (probado con la versión 24; las funciones que usa existen desde la 20, pero no se ha probado en versiones anteriores a la 24). No hay dependencias que instalar.

```bash
npm test                  # pruebas (no hacen peticiones de red)
npm run inventario        # valida data/locales.json
npm run extract:dry       # muestra qué se consultaría, sin clave y sin llamar a la API
```

Para ejecutar con datos reales hace falta que todos los locales estén verificados (`"verificado": true`) y una clave de Google Places API **solo en tu entorno, nunca en un archivo**:

```bash
export GOOGLE_PLACES_API_KEY=tu_clave
npm run extract           # escribe data/fichas_raw.json
npm run analyze           # escribe data/hallazgos.json
npm run report            # escribe public/index.html
```

En PowerShell: `$env:GOOGLE_PLACES_API_KEY="tu_clave"`.

Para probar el sistema con datos ficticios: `npm run demo` y `npm run report:demo` (el informe sale marcado como DATOS DE EJEMPLO y no se escribe en `public/`).

Antes de publicar: `npm run secretos`, `npm run entrega:comprobar` y `npm run entrega:resumen`.

## Datos y fuentes

- **Inventario**: webs oficiales de las marcas, consultadas en solo lectura. Las webs no anuncian un número total de locales, así que el recuento se contrasta a mano.
- **Fichas**: Google Places API (New), solo lectura. No se usa scraping, no se usan datos internos y no se modifica ninguna ficha.
- Todo dato que la API no devuelve se marca como `ausente`; si la consulta falla, `no_disponible`. Un dato no disponible nunca se evalúa ni se infiere.
- El informe declara la fuente y la fecha de extracción.

## Qué se versiona

Se versionan el código, las pruebas, el inventario (`data/locales.json`, `data/cifras_oficiales.json`), los resultados (`data/hallazgos.json`) y el informe publicado (`public/index.html`). Se ignoran las credenciales (`.env`), el borrador del mensaje de entrega (`entrega/`) y las salidas de demostración.

`data/fichas_raw.json` contiene contenido copiado de Google Places. Los términos de Google limitan el almacenamiento de ese contenido, así que su publicación depende de una decisión del autor tras revisarlos: si se decide no publicarlo, se añade a `.gitignore` y el resto del flujo no cambia.

## Score y pesos

`score = max(0, 100 − suma de pesos de los hallazgos del local)`.

Pesos por severidad: alta 15, media 7, baja 3. Tramos: verde 80-100, ámbar 50-79, rojo 0-49. Los locales sin ficha resuelta aparecen como "sin datos" y no puntúan.

Reglas: campos ausentes (descripción, web, teléfono, atributos), horario ausente o incompleto, fotos insuficientes, nombre inconsistente dentro de la marca, categoría distinta dentro de la marca, web genérica y atributos que la web declara pero la ficha no marca.

## Limitaciones

- La API devuelve como máximo 10 fotos por ficha; la regla de fotos se calibra con ese tope.
- No se evalúan los horarios especiales o festivos: la API solo informa de los próximos 7 días y el resultado dependería de la fecha de extracción.
- Las reglas de nombre y categoría solo se aplican a marcas con al menos 3 locales evaluados.
- Los atributos que la web declara (`web_declara`) se han tomado de la página de cada local; la accesibilidad no aparece declarada en ninguna.
- No se han analizado reseñas, competencia ni la web corporativa.
- El análisis refleja el estado público de las fichas en la fecha de extracción.

## Qué no se hace

No se modifica nada en fichas reales, no se contacta con locales ni empleados y no se presentan estimaciones de impacto económico. Las ideas fuera de alcance están en [BACKLOG_FUTURO.md](BACKLOG_FUTURO.md).
