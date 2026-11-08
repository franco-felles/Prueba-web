/* ==========================================================
   Genera clases/manifiesto.json: qué complementos tiene cada carpeta de clase.
   La web no puede "listar" carpetas, por eso existe este índice.

   Nomenclatura dentro de clases/<id>/   (id = u1c04, ec2 …)
     pag-<nombre>.html     → aparece en "Actividades"
     juego-<nombre>.html   → aparece en "Juegos"
     cualquier otro archivo (imágenes, .js, .css) → no aparece; lo usan esas páginas

   Título: <meta name="session-title" content="…">, si no <title>, si no el nombre del archivo.
   Se ejecuta solo al hacer commit (gancho de git) y en GitHub Actions; a mano: node tools/manifiesto.js
   ========================================================== */
const fs = require("fs"), path = require("path");
const raiz = path.join(__dirname, "..", "clases");
const salida = {};

const deNombre = f => f.replace(/^(pag|juego)-/i, "").replace(/\.html?$/i, "").replace(/[-_]+/g, " ").replace(/^\w/, c => c.toUpperCase());
function titulo(ruta, archivo) {
  const html = fs.readFileSync(ruta, "utf8").slice(0, 6000);
  const m = /<meta\s+name=["']session-title["']\s+content=["']([^"']+)["']/i.exec(html) || /<title>([^<]+)<\/title>/i.exec(html);
  return m ? m[1].trim() : deNombre(archivo);
}

for (const d of fs.readdirSync(raiz, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const dir = path.join(raiz, d.name);
  const archivos = fs.readdirSync(dir).filter(f => /^(pag|juego)-.+\.html?$/i.test(f)).sort();
  if (archivos.length) salida[d.name.toLowerCase()] = archivos.map(f => ({
    archivo: f, tipo: /^juego-/i.test(f) ? "juego" : "pagina", titulo: titulo(path.join(dir, f), f)
  }));
}
const texto = JSON.stringify(salida, null, 2) + "\n";
const destino = path.join(raiz, "manifiesto.json");
const antes = fs.existsSync(destino) ? fs.readFileSync(destino, "utf8") : "";
if (antes !== texto) { fs.writeFileSync(destino, texto); console.log("manifiesto.json actualizado"); }
else console.log("manifiesto.json sin cambios");
