/* ==========================================================
   API WEB  ·  lo que la página (Vercel) le pide al Panel

   Va en el MISMO proyecto de Apps Script que panel.gs, como un segundo archivo
   (Archivos → + → Secuencia de comandos → "api").
   Se publica: Implementar → Nueva implementación → Aplicación web
               Ejecutar como: Yo · Quién tiene acceso: Cualquier persona
   La URL (/exec) va en config.js de la web.

   La web siempre hace POST con JSON {accion, token, ...} y recibe {ok, ...} o {ok:false, error}.
   Seguridad:
     · Alumno: entra con su código; solo si está "Activo" y con grupo en la pestaña Alumnos.
     · Docente: contraseña guardada cifrada (SHA-256 + sal) en Propiedades del script,
       nunca en la hoja ni en la web. Se cambia desde la web o desde Aula → Contraseña docente.
     · Cada login recibe un token que dura 6 h; la web solo ve los datos de quien inició sesión.
   ========================================================== */

const TOKEN_SEG = 6 * 60 * 60;
const CAB_QUIZ = ["ID", "TITULO", "CLASE", "MOSTRAR", "ABIERTO", "NPREG", "PREGUNTAS", "ACTUALIZADO"];
const CAB_RES = ["QUIZ", "CODIGO", "ALUMNO", "GRUPO", "ACIERTOS", "TOTAL", "NOTA", "CORRECCION", "INCIDENTES", "HORA", "DETALLE"];

function doGet() { return salida({ ok: true, app: "Aula Virtual" }); }

function doPost(e) {
  let req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || "{}"); }
  catch (_) { return salida({ ok: false, error: "Solicitud inválida" }); }
  const fn = ACCIONES[req.accion];
  if (!fn) return salida({ ok: false, error: "Acción desconocida" });
  try { return salida(Object.assign({ ok: true }, fn(req) || {})); }
  catch (err) { return salida({ ok: false, error: err && err.message ? err.message : String(err) }); }
}

const ACCIONES = {
  login: apiLogin, loginDocente: apiLoginDocente, companero: apiCompanero, cambiarClave: apiCambiarClave,
  portal: apiPortal, clase: apiClase,
  quizLista: apiQuizLista, quizVer: apiQuizVer, quizGuardar: apiQuizGuardar, quizBorrar: apiQuizBorrar,
  quizRendir: apiQuizRendir, quizEnviar: apiQuizEnviar, quizCorregir: apiQuizCorregir, quizReiniciar: apiQuizReiniciar
};

/* ======================= SESIÓN ======================= */

/** "U1C01" → "u1c1", "EC2U1" → "ec2u1": tolera ceros y mayúsculas en los IDs escritos a mano. */
const normId = s => String(s || "").toLowerCase().trim().replace(/([a-z])0+(\d)/g, "$1$2");
const normCodigo = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const cache = () => CacheService.getScriptCache();

/* ---------- memoria de datos ----------
   Cada pestaña se lee una vez y se guarda ya procesada DS_SEG segundos, así la web no abre la hoja en cada visita.
   Se borra sola cuando editas el Panel (onEdit) o cuando el script cambia algo (invalidarCache). */
const DS_SEG = 300;
const DS = ["alumnos", "clases", "enlaces", "entregas", "quiz", "res"];
function datos(nombre, leer) {
  const k = "ds_" + nombre, hit = cache().get(k);
  if (hit) { try { return JSON.parse(hit); } catch (_) {} }
  const v = leer();
  try { cache().put(k, JSON.stringify(v), DS_SEG); } catch (_) {}     // si pasa de 100 KB simplemente no se guarda
  return v;
}
function invalidarCache(nombres) { cache().removeAll((nombres || DS).map(n => "ds_" + n)); }

function nuevoToken(datos) {
  const t = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  cache().put("t_" + t, JSON.stringify(datos), TOKEN_SEG);
  return t;
}
function guardarSesion(token, datos) { cache().put("t_" + token, JSON.stringify(datos), TOKEN_SEG); }

/** Devuelve la sesión del token o lanza "SESION" (la web entonces vuelve al login). */
function sesionDe(req, rol) {
  const raw = req.token && cache().get("t_" + req.token);
  if (!raw) throw new Error("SESION");
  const s = JSON.parse(raw);
  guardarSesion(req.token, s);                     // renueva las 6 h con cada uso
  if (rol && s.rol !== rol) throw new Error("No tienes permiso para esto.");
  return s;
}

function alumnosTodos() { return datos("alumnos", () => leerTabla(hoja(HOJA.alumnos)).filas.filter(f => f.CODIGO)); }
const esActivo = a => a.ESTADO === "Activo" && a.GRUPO;
const pub = a => ({ codigo: a.CODIGO, nombre: a["APELLIDOS Y NOMBRES"], grupo: a.GRUPO, n: a.N, pc: a.PC });

function buscarAlumno(codigo) {
  const c = normCodigo(codigo);
  if (!c) throw new Error("Escribe tu código.");
  const a = alumnosTodos().find(x => normCodigo(x.CODIGO) === c);
  if (!a) throw new Error("No encontramos ese código. Revísalo o avisa a tu docente.");
  if (!esActivo(a)) throw new Error("Tu docente aún no te habilitó (falta asignarte grupo). Avísale.");
  return a;
}

function apiLogin(req) {
  const a = buscarAlumno(req.codigo);
  const token = nuevoToken({ rol: "alumno", codigos: [a.CODIGO] });
  return { token, rol: "alumno", alumnos: [pub(a)] };
}

function apiCompanero(req) {
  const s = sesionDe(req, "alumno");
  const a = buscarAlumno(req.codigo);
  if (s.codigos.indexOf(a.CODIGO) >= 0) throw new Error("Ese alumno ya está en esta sesión.");
  if (s.codigos.length >= 3) throw new Error("Máximo 3 alumnos por computadora.");
  s.codigos.push(a.CODIGO);
  guardarSesion(req.token, s);
  const todos = alumnosTodos();
  return { alumnos: s.codigos.map(c => pub(todos.find(x => x.CODIGO === c))) };
}

/* ---------- contraseña del docente ---------- */

function hashClave(clave, sal) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + "|" + clave, Utilities.Charset.UTF_8)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");
}
function fijarClave(clave) {
  clave = String(clave || "").trim();
  if (clave.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
  const sal = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty("DOCENTE_CLAVE", sal + ":" + hashClave(clave, sal));
}
function claveCorrecta(clave) {
  const guardada = PropertiesService.getScriptProperties().getProperty("DOCENTE_CLAVE");
  if (!guardada) throw new Error("Aún no hay contraseña de docente. Créala en el Panel: Aula → Contraseña docente.");
  const [sal, h] = guardada.split(":");
  return hashClave(String(clave || "").trim(), sal) === h;
}

function apiLoginDocente(req) {
  const c = cache(), fallos = Number(c.get("fallos_docente") || 0);
  if (fallos >= 8) throw new Error("Demasiados intentos. Espera 10 minutos.");
  if (!claveCorrecta(req.clave)) {
    c.put("fallos_docente", String(fallos + 1), 600);
    throw new Error("Contraseña incorrecta.");
  }
  c.remove("fallos_docente");
  const nombre = String(valorConfig("DOCENTE") || "Docente");
  return { token: nuevoToken({ rol: "docente" }), rol: "docente", nombre };
}

function apiCambiarClave(req) {
  sesionDe(req, "docente");
  if (!claveCorrecta(req.actual)) throw new Error("La contraseña actual no es correcta.");
  fijarClave(req.nueva);
  return {};
}

/** Menú del Panel: crear o reponer la contraseña (sirve si la olvidas). */
function contrasenaDocente() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt("Contraseña docente", "Escribe la NUEVA contraseña (mínimo 6 caracteres):", ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const r2 = ui.prompt("Contraseña docente", "Repítela:", ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  if (r1.getResponseText() !== r2.getResponseText()) return aviso("No coinciden. No se cambió nada.");
  try { fijarClave(r1.getResponseText()); aviso("Contraseña guardada."); } catch (e) { aviso(e.message); }
}

/* ======================= PORTAL Y CLASES ======================= */

function clasesTodas() {
  return datos("clases", () => leerTabla(hoja(HOJA.clases), ["CARPETA"]).filas.filter(f => f.ID).map(f => ({
    id: normId(f.ID), tipo: f.TIPO, unidad: f.UNIDAD, n: f.N, tema: f.TEMA, publicada: f.PUBLICADA === true,
    carpeta: (/\/folders\/([\w-]+)/.exec(f._formulas.CARPETA || "") || [])[1] || ""
  })));
}
const clasePublica = c => ({ id: c.id, tipo: c.tipo, unidad: c.unidad, n: c.n, tema: c.tema, publicada: c.publicada });

function apiPortal(req) {
  const s = sesionDe(req);
  const docente = s.rol === "docente";
  const clases = clasesTodas().filter(c => docente || c.publicada).map(clasePublica);
  const quizzes = quizzesTodos().filter(q => docente || q.abierto);
  const res = docente ? [] : resultadosTodos();
  const out = {
    clases,
    quizzes: quizzes.map(q => ({
      id: q.id, titulo: q.titulo, clase: q.clase, abierto: q.abierto, npreg: q.npreg,
      rendidos: docente ? undefined : s.codigos.filter(c => res.some(r => r.QUIZ === q.id && r.CODIGO === c))
    }))
  };
  if (docente) out.panel = SpreadsheetApp.getActive().getUrl();
  else { const todos = alumnosTodos(); out.alumnos = s.codigos.map(c => pub(todos.find(x => x.CODIGO === c))); }
  return out;
}

const TIPO_MIME = {
  "application/vnd.google-apps.presentation": "presentacion", "application/vnd.google-apps.document": "documento",
  "application/vnd.google-apps.spreadsheet": "hoja", "application/vnd.google-apps.form": "encuesta",
  "application/pdf": "pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "presentacion",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "documento",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "hoja"
};
function tipoDeMime(m) {
  if (TIPO_MIME[m]) return TIPO_MIME[m];
  if (/^video\//.test(m)) return "video";
  if (/^image\//.test(m)) return "imagen";
  return "archivo";
}

/** Archivos "para ver" de la carpeta de la clase (no la semilla, no ALUMNOS/, no los que empiezan con _). */
function materialesDe(c) {
  const clave = "mat_" + c.id, enCache = cache().get(clave);
  if (enCache) return JSON.parse(enCache);
  let carpeta = null;
  try { carpeta = c.carpeta ? DriveApp.getFolderById(c.carpeta) : null; } catch (_) {}
  const lista = [];
  if (carpeta) {
    const it = carpeta.getFiles();
    while (it.hasNext()) {
      const f = it.next(), n = f.getName(), nl = n.toLowerCase();
      if (nl.indexOf("semilla") === 0 || nl.indexOf("profesor") === 0 || n.charAt(0) === "_") continue;
      try { if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (_) {}
      lista.push({ titulo: n.replace(/\.[a-z0-9]{2,5}$/i, ""), url: f.getUrl(), tipo: tipoDeMime(f.getMimeType()) });
    }
  }
  lista.sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { numeric: true }));
  cache().put(clave, JSON.stringify(lista), 300);    // archivos nuevos en Drive aparecen en ≤ 5 min (o Aula → Actualizar web ahora)
  return lista;
}

function apiClase(req) {
  const s = sesionDe(req);
  const docente = s.rol === "docente";
  const c = clasesTodas().find(x => x.id === normId(req.id));
  if (!c || (!docente && !c.publicada)) throw new Error("Esta clase no está disponible.");

  const todos = alumnosTodos();
  const misAlumnos = docente ? [] : s.codigos.map(cod => todos.find(x => x.CODIGO === cod)).filter(Boolean);
  const grupos = misAlumnos.map(a => a.GRUPO);

  const enlaces = datos("enlaces", () => leerTabla(hoja(HOJA.enlaces)).filas)
    .filter(f => normId(f.CLASE) === c.id && f.URL)
    .filter(f => docente || !f.PARA || f.PARA === "Todos" || grupos.indexOf(f.PARA) >= 0)
    .sort((a, b) => (Number(a.ORDEN) || 99) - (Number(b.ORDEN) || 99))
    .map(f => ({ titulo: f.TITULO || f.URL, url: f.URL, tipo: f.TIPO || "enlace", para: f.PARA || "Todos" }));

  // Cada alumno puede tener varias copias (una por semilla: un Doc y un Sheet, etc.). `url` = la primera, por compatibilidad.
  const entregas = datos("entregas", () => leerTabla(hoja(HOJA.entregas)).filas).filter(f => normId(f.CLASE) === c.id && f.ENLACE);
  const conArchivos = a => {
    const archivos = entregas.filter(x => x.CODIGO === a.CODIGO)
      .map(x => ({ titulo: x.TITULO || "Mi documento", tipo: x.TIPO || "documento", url: x.ENLACE }))
      .sort((p, q) => p.titulo.localeCompare(q.titulo));
    return Object.assign(pub(a), { archivos, url: archivos.length ? archivos[0].url : null });
  };
  const docs = (docente ? todos.filter(esActivo) : misAlumnos).map(conArchivos);

  const quizzes = quizzesTodos().filter(q => q.clase === c.id && (docente || q.abierto))
    .map(q => ({ id: q.id, titulo: q.titulo, abierto: q.abierto, npreg: q.npreg }));

  return { clase: clasePublica(c), materiales: materialesDe(c), enlaces, docs, quizzes, haySemilla: entregas.length > 0 };
}

/* ======================= QUIZ ======================= */

function tablaFija(nombre, cab) {
  const sh = hoja(nombre);
  if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, cab.length).setValues([cab]); estiloCabecera(sh, cab.length); }
  return sh;
}
function quizzesTodos(fresco) {
  const leer = () => leerTabla(tablaFija("Quiz", CAB_QUIZ)).filas.filter(f => f.ID).map(f => {
    let preguntas = []; try { preguntas = JSON.parse(f.PREGUNTAS || "[]"); } catch (_) {}
    return { id: String(f.ID), titulo: f.TITULO, clase: normId(f.CLASE), mostrar: Number(f.MOSTRAR) || 0,
             abierto: f.ABIERTO === true || f.ABIERTO === "TRUE", npreg: preguntas.length, preguntas, _fila: f._fila };
  });
  return fresco ? leer() : datos("quiz", leer);
}
function quizDe(id, fresco) {
  const q = quizzesTodos(fresco).find(x => x.id === String(id || ""));
  if (!q) throw new Error("No existe ese quiz.");
  return q;
}
function resultadosTodos(fresco) {
  const leer = () => leerTabla(tablaFija("Resultados", CAB_RES)).filas.filter(f => f.QUIZ);
  return fresco ? leer() : datos("res", leer);
}
const resPublico = r => {
  let detalle = []; try { detalle = JSON.parse(r.DETALLE || "[]"); } catch (_) {}
  return { codigo: r.CODIGO, alumno: r.ALUMNO, grupo: r.GRUPO, aciertos: r.ACIERTOS, total: r.TOTAL, nota: r.NOTA,
           correccion: r.CORRECCION === "" ? null : r.CORRECCION, incidentes: r.INCIDENTES, hora: r.HORA, detalle };
};

function apiQuizLista(req) {
  sesionDe(req, "docente");
  const res = resultadosTodos();
  return { quizzes: quizzesTodos().map(q => ({ id: q.id, titulo: q.titulo, clase: q.clase, mostrar: q.mostrar, abierto: q.abierto,
    npreg: q.npreg, rindieron: res.filter(r => r.QUIZ === q.id).length })),
    clases: clasesTodas().map(clasePublica) };
}

function apiQuizVer(req) {
  sesionDe(req, "docente");
  const q = quizDe(req.id);
  return { quiz: { id: q.id, titulo: q.titulo, clase: q.clase, mostrar: q.mostrar, abierto: q.abierto, preguntas: q.preguntas },
           resultados: resultadosTodos().filter(r => r.QUIZ === q.id).map(resPublico),
           alumnos: alumnosTodos().filter(esActivo).map(pub) };
}

function apiQuizGuardar(req) {
  sesionDe(req, "docente");
  const d = req.quiz || {};
  const titulo = String(d.titulo || "").trim();
  if (!titulo) throw new Error("Ponle un título al quiz.");
  const preguntas = (d.preguntas || []).map((p, i) => {
    const alts = (p.alts || []).map(a => String(a || "").trim()).filter(Boolean);
    const texto = String(p.texto || "").trim();
    if (!texto) throw new Error(`La pregunta ${i + 1} está vacía.`);
    if (alts.length < 2) throw new Error(`La pregunta ${i + 1} necesita al menos 2 alternativas.`);
    const correcta = Number(p.correcta);
    if (!(correcta >= 0 && correcta < alts.length)) throw new Error(`Marca la respuesta correcta de la pregunta ${i + 1}.`);
    return { id: p.id || "p" + Utilities.getUuid().slice(0, 8), tema: String(p.tema || "").trim(), texto, alts, correcta };
  });
  if (!preguntas.length) throw new Error("El quiz no tiene preguntas.");

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = tablaFija("Quiz", CAB_QUIZ), t = leerTabla(sh);
    const id = d.id || "qz" + Date.now().toString(36);
    const fila = { ID: id, TITULO: titulo, CLASE: normId(d.clase), MOSTRAR: Math.max(0, Number(d.mostrar) || 0),
                   ABIERTO: !!d.abierto, NPREG: preguntas.length, PREGUNTAS: JSON.stringify(preguntas), ACTUALIZADO: new Date() };
    const existente = t.filas.find(f => f.ID === id);
    if (existente) escribir(sh, t, existente._fila, fila);
    else sh.appendRow(filaDesde(t.cab, fila));
    invalidarCache(["quiz"]);
    return { id };
  } finally { lock.releaseLock(); }
}

function apiQuizBorrar(req) {
  sesionDe(req, "docente");
  const q = quizDe(req.id, true);
  tablaFija("Quiz", CAB_QUIZ).deleteRow(q._fila);
  invalidarCache(["quiz"]);
  return {};
}

const barajar = a => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = x[i]; x[i] = x[j]; x[j] = t; } return x; };

function alumnoDeSesion(s, codigo) {
  if (s.rol !== "alumno" || s.codigos.indexOf(codigo) < 0) throw new Error("Ese alumno no está en esta sesión.");
  return alumnosTodos().find(x => x.CODIGO === codigo);
}

/** Entrega las preguntas SIN la respuesta correcta. Guarda cuáles le tocaron para corregir después. */
function apiQuizRendir(req) {
  const s = sesionDe(req, "alumno");
  const a = alumnoDeSesion(s, req.codigo);
  const q = quizDe(req.id);
  const previo = resultadosTodos().find(r => r.QUIZ === q.id && r.CODIGO === a.CODIGO);
  if (previo) return { yaRendido: resPublico(previo), titulo: q.titulo };
  if (!q.abierto) throw new Error("Este quiz está cerrado.");
  const total = q.mostrar > 0 ? Math.min(q.mostrar, q.preguntas.length) : q.preguntas.length;
  const elegidas = barajar(q.preguntas).slice(0, total);
  cache().put(`ex_${req.token}_${q.id}_${a.CODIGO}`, JSON.stringify(elegidas.map(p => p.id)), TOKEN_SEG);
  return { titulo: q.titulo, preguntas: elegidas.map(p => ({
    id: p.id, tema: p.tema, texto: p.texto, opciones: barajar(p.alts.map((t, i) => ({ i, texto: t })))
  })) };
}

function apiQuizEnviar(req) {
  const s = sesionDe(req, "alumno");
  const a = alumnoDeSesion(s, req.codigo);
  const q = quizDe(req.id);
  const raw = cache().get(`ex_${req.token}_${q.id}_${a.CODIGO}`);
  if (!raw) throw new Error("El intento expiró. Vuelve a abrir el quiz.");
  const ids = JSON.parse(raw);
  const porId = {}; q.preguntas.forEach(p => porId[p.id] = p);
  const resp = {}; (req.respuestas || []).forEach(r => resp[r.id] = r);
  const detalle = ids.map(id => {
    const r = resp[id] || {}, p = porId[id];
    return { id, orden: r.orden || [], elegida: r.elegida === undefined ? null : Number(r.elegida), ok: !!p && Number(r.elegida) === p.correcta };
  });
  const aciertos = detalle.filter(d => d.ok).length, total = ids.length;
  const nota = Math.round(aciertos / total * 200) / 10;

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (resultadosTodos(true).some(r => r.QUIZ === q.id && r.CODIGO === a.CODIGO)) throw new Error("Ya rendiste este quiz.");
    const sh = tablaFija("Resultados", CAB_RES), t = leerTabla(sh);
    sh.appendRow(filaDesde(t.cab, { QUIZ: q.id, CODIGO: a.CODIGO, ALUMNO: a["APELLIDOS Y NOMBRES"], GRUPO: a.GRUPO,
      ACIERTOS: aciertos, TOTAL: total, NOTA: nota, CORRECCION: "", INCIDENTES: Number(req.incidentes) || 0,
      HORA: new Date(), DETALLE: JSON.stringify(detalle) }));
    invalidarCache(["res"]);
  } finally { lock.releaseLock(); }
  cache().remove(`ex_${req.token}_${q.id}_${a.CODIGO}`);
  return { aciertos, total, nota };
}

function apiQuizCorregir(req) {
  sesionDe(req, "docente");
  const sh = tablaFija("Resultados", CAB_RES), t = leerTabla(sh);
  const f = t.filas.find(r => r.QUIZ === req.id && r.CODIGO === req.codigo);
  if (!f) throw new Error("No hay resultado para ese alumno.");
  const v = req.correccion === null || req.correccion === "" ? "" : Math.max(0, Math.min(20, Number(req.correccion)));
  escribir(sh, t, f._fila, { CORRECCION: v });
  invalidarCache(["res"]);
  return {};
}

function apiQuizReiniciar(req) {
  sesionDe(req, "docente");
  const codigos = req.codigos || [];
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = tablaFija("Resultados", CAB_RES), t = leerTabla(sh);
    t.filas.filter(r => r.QUIZ === req.id && codigos.indexOf(r.CODIGO) >= 0)
      .map(r => r._fila).sort((a, b) => b - a).forEach(n => sh.deleteRow(n));
    invalidarCache(["res"]);
  } finally { lock.releaseLock(); }
  return {};
}

/* ======================= UTILIDADES ======================= */

function valorConfig(clave) {
  const sh = hoja(HOJA.config);
  if (sh.getLastRow() < 2) return "";
  const fila = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().find(r => r[0] === clave);
  return fila ? fila[1] : "";
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
