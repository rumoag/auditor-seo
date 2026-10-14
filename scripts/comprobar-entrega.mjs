// UT-6: lista de verificación previa a la entrega. Uso: node scripts/comprobar-entrega.mjs [directorio]
// Sale con código 1 si algún punto automatizable falla. Los puntos "manual" los comprueba el usuario.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { comprobarEntrega } from './lib/entrega.mjs';

const MARCA = { ok: '[ok]    ', fallo: '[FALLO] ', manual: '[manual]' };

async function main() {
  const { ok, items } = await comprobarEntrega({ raiz: resolve(process.argv[2] ?? '.') });
  for (const i of items) console.log(`${MARCA[i.estado]} ${i.descripcion}\n         ${i.evidencia}`);
  const fallos = items.filter(i => i.estado === 'fallo').length;
  const manuales = items.filter(i => i.estado === 'manual').length;
  console.log(`\n${fallos} fallos, ${manuales} puntos manuales pendientes.`);
  if (!ok) {
    console.error('NO LISTO para entregar.');
    process.exit(1);
  }
  console.log('Listo para entregar (revisa los puntos manuales).');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}
