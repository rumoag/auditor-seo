// UT-6: busca credenciales en el proyecto antes de publicar. Uso: node scripts/escanear-secretos.mjs [directorio]
// Sale con código 1 si encuentra algo. Nunca imprime el valor completo.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { escanearDirectorio } from './lib/secretos.mjs';

async function main() {
  const raiz = resolve(process.argv[2] ?? '.');
  const { hallazgos, avisos, archivos } = await escanearDirectorio(raiz);
  console.log(`Escaneados ${archivos} archivos en ${raiz}`);
  avisos.forEach(a => console.warn(`AVISO: ${a}`));
  for (const h of hallazgos) console.error(`POSIBLE CREDENCIAL: ${h.tipo} en ${h.ruta}:${h.linea} (${h.muestra})`);
  if (hallazgos.length) {
    console.error(`${hallazgos.length} posibles credenciales. No publiques hasta resolverlo.`);
    process.exit(1);
  }
  console.log('Sin credenciales detectadas.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}
