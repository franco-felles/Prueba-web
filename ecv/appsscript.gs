/**
 * BACKEND DE RESULTADOS · Aula Virtual (evaluaciones virtuales "ecv")
 *
 * CÓMO USAR (una sola vez):
 *   1. Entra a https://script.google.com -> "Nuevo proyecto".
 *   2. Borra el código que aparece y pega TODO este archivo.
 *   3. Guarda (nombre sugerido: "Resultados Aula Virtual").
 *   4. Implementar -> Nueva implementación -> tipo "Aplicación web":
 *        - Ejecutar como: Yo
 *        - Quién tiene acceso: Cualquier persona
 *   5. Copia la URL (termina en /exec) y pégala en ecv/config.js
 *
 * Guarda un JSON por alumno (clave = código) por sesión. Solo códigos y letras;
 * el nombre del alumno sale de access/access.csv en la página del docente.
 */

const PREFIX = "res_";

function doGet(e) {
  const sesion = String((e && e.parameter && e.parameter.sesion) || "").toLowerCase();
  const out = {};
  const pre = PREFIX + sesion + "_";
  const props = PropertiesService.getScriptProperties().getProperties();
  Object.keys(props).forEach(function (k) {
    if (k.indexOf(pre) === 0) {
      const codigo = k.slice(pre.length);
      try { out[codigo] = JSON.parse(props[k]); } catch (err) { out[codigo] = null; }
    }
  });
  return jsonOut(out);
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const sesion = String(data.sesion || "").toLowerCase();
    const codigo = String(data.codigo || "").trim();
    const codigos = (data.codigos || []).map(function (c) { return String(c).trim(); }).filter(Boolean);
    const borrar = !!data.borrar;
    const resultado = data.resultado;
    if (!sesion || (!codigo && !codigos.length)) return jsonOut({ ok: false, error: "faltan datos" });

    const props = PropertiesService.getScriptProperties();
    const key = PREFIX + sesion + "_";
    if (codigos.length) {
      codigos.forEach(function (c) { props.deleteProperty(key + c); });
    } else if (borrar) {
      props.deleteProperty(key + codigo);
    } else {
      props.setProperty(key + codigo, JSON.stringify(resultado));
    }
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
