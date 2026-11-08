/* ==========================================================
   PANEL AULA VIRTUAL  ·  Apps Script del "Panel Aula Virtual"

   Se pega en: Panel Aula Virtual → Extensiones → Apps Script.
   Requiere el servicio avanzado "Drive API" (Servicios → + → Drive API)
   para leer los PDF de la institución.

   Menú "Aula" (aparece al abrir la hoja):
     · Configurar panel ............ crea pestañas, listas desplegables y formato (1.ª vez)
     · Importar alumnos (PDF) ...... lee los PDF de <MES>/LISTAS
     · Importar alumnos (texto) .... lee lo pegado en la pestaña "Importar"
     · Nueva clase / EC ............ crea la carpeta y su fila en "Clases"
     · Generar copias .............. copia la semilla de cada clase para cada alumno
     · Actualizar laboratorio ...... recalcula "Comparte con" y el mapa de PCs
     · Contraseña docente .......... crea o repone tu clave de la web (api.gs)

   Estructura en Drive:
     AULA VIRTUAL/                 (carpeta donde está este Panel)
       BIBLIOTECA/                 semillas reutilizables
       NOV 2026/                   carpeta del mes (Config → MES)
         LISTAS/                   PDF de la institución
         U1/ C1 - Tema/            SEMILLA - profesor  +  ALUMNOS/ (copias)
         U1/ EC1 - Tema/           (igual que una clase)
         U2/ ...
   Orden de cada unidad: C1 · C2 · EC1 · C4 · C5 · EC2 · C7 · C8 · EC3
   IDs: u1c4 = clase 4 de la unidad 1 · ec2u1 = evaluación continua 2 de la unidad 1
   ========================================================== */

const HOJA = {
  config: "Config", alumnos: "Alumnos", clases: "Clases", entregas: "Entregas",
  enlaces: "Enlaces", lab: "Laboratorio", importar: "Importar"
};

const CABECERAS = {
  Alumnos:  ["CODIGO", "APELLIDOS Y NOMBRES", "N LISTA", "ESTADO", "GRUPO", "N", "PC", "COMPARTE CON", "ORIGEN", "NOTA"],
  Clases:   ["ID", "TIPO", "UNIDAD", "N", "TEMA", "CARPETA", "PUBLICADA", "COPIAS", "NOTA"],
  Entregas: ["CLASE", "CODIGO", "GRUPO", "N", "ALUMNO", "ENLACE", "ARCHIVO_ID", "CREADO"],
  Enlaces:  ["CLASE", "ORDEN", "TIPO", "TITULO", "URL", "PARA"]
};

const ESTADOS = ["Pendiente", "Activo", "No asiste", "Retirado"];
const TIPOS_ENLACE = ["enlace", "documento", "hoja", "presentacion", "encuesta", "video", "web", "juego"];
const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SET", "OCT", "NOV", "DIC"];
const MESES_LARGOS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO",
                      "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const LIMITE_MS = 5 * 60 * 1000;   // Apps Script corta a los 6 min; paramos antes

/* ======================= MENÚ ======================= */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Aula")
    .addItem("Configurar panel (primera vez)", "configurarPanel")
    .addSeparator()
    .addItem("Importar alumnos (PDF en LISTAS)", "importarAlumnosPDF")
    .addItem("Importar alumnos (texto pegado en «Importar»)", "importarAlumnosTexto")
    .addSeparator()
    .addItem("Nueva clase / EC…", "nuevaClase")
    .addItem("Generar copias", "generarCopias")
    .addSeparator()
    .addItem("Actualizar laboratorio", "actualizarLaboratorio")
    .addItem("Abrir carpeta del mes", "abrirCarpetaMes")
    .addSeparator()
    .addItem("Contraseña docente…", "contrasenaDocente")
    .addToUi();
}

/* ======================= CONFIGURACIÓN ======================= */

function configurarPanel() {
  const ss = SpreadsheetApp.getActive();

  // Config
  const cfg = hoja(HOJA.config);
  if (cfg.getLastRow() < 2) {
    const raiz = DriveApp.getFileById(ss.getId()).getParents().next();
    const hoy = new Date();
    cfg.getRange(1, 1, 5, 3).setValues([
      ["CLAVE", "VALOR", "PARA QUÉ"],
      ["MES", MESES[hoy.getMonth()] + " " + hoy.getFullYear(), "Nombre de la carpeta del mes actual (ej. NOV 2026)"],
      ["GRUPOS", "G1,G2", "Grupos separados por coma"],
      ["PCS", 30, "Cantidad de PC de la sede (lo cambias al llegar)"],
      ["RAIZ_ID", raiz.getId(), "Carpeta AULA VIRTUAL (no tocar)"]
    ]);
    estiloCabecera(cfg, 3);
    cfg.setColumnWidth(2, 200); cfg.setColumnWidth(3, 380);
  }
  // Claves que se agregaron después (no pisa lo que ya escribiste)
  const existentes = cfg.getRange(1, 1, cfg.getLastRow(), 1).getValues().map(r => r[0]);
  [["DOCENTE", "Docente", "Tu nombre como aparece en la web"]].forEach(f => { if (existentes.indexOf(f[0]) < 0) cfg.appendRow(f); });

  // Tablas
  Object.keys(CABECERAS).forEach(n => {
    const sh = hoja(n);
    if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, CABECERAS[n].length).setValues([CABECERAS[n]]);
    estiloCabecera(sh, CABECERAS[n].length);
  });

  const grupos = config().grupos;
  const al = hoja(HOJA.alumnos);
  validacionLista(al, colDe(al, "ESTADO"), ESTADOS);
  validacionLista(al, colDe(al, "GRUPO"), grupos);
  al.setColumnWidth(colDe(al, "APELLIDOS Y NOMBRES"), 320);
  al.setColumnWidth(colDe(al, "COMPARTE CON"), 260);
  al.getRange(2, colDe(al, "COMPARTE CON"), al.getMaxRows() - 1, 1).setFontColor("#9a3412");

  const cl = hoja(HOJA.clases);   // las casillas PUBLICADA se crean fila por fila (si no, appendRow escribe al final de la hoja)
  cl.setColumnWidth(colDe(cl, "TEMA"), 280);

  const en = hoja(HOJA.enlaces);
  validacionLista(en, colDe(en, "TIPO"), TIPOS_ENLACE);
  validacionLista(en, colDe(en, "PARA"), ["Todos"].concat(grupos));
  en.getRange(2, 1, en.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(cl.getRange("A2:A"), true).setAllowInvalid(false).build());
  en.setColumnWidth(colDe(en, "TITULO"), 260); en.setColumnWidth(colDe(en, "URL"), 320);

  const imp = hoja(HOJA.importar);
  if (imp.getLastRow() === 0) imp.getRange("A1").setValue("Pega aquí (desde la celda A2) el texto copiado del PDF de la institución y usa Aula → Importar alumnos (texto).");

  hoja(HOJA.lab);
  ["Hoja 1", "Sheet1", "Hoja1"].forEach(n => { const s = ss.getSheetByName(n); if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s); });

  carpetaMes(); // crea la carpeta del mes si no existe
  ss.setActiveSheet(al);
  aviso("Panel listo. Siguiente paso: deja los PDF de la institución en " + config().mes + "/LISTAS y usa Aula → Importar alumnos (PDF).");
}

/* ======================= IMPORTAR ALUMNOS ======================= */

function importarAlumnosPDF() {
  const listas = subcarpeta(carpetaMes(), "LISTAS");
  const it = listas.getFilesByType(MimeType.PDF);
  const lotes = [];
  while (it.hasNext()) {
    const f = it.next();
    lotes.push({ origen: "PDF " + f.getName(), texto: pdfATexto(f) });
  }
  if (!lotes.length) return aviso("No hay PDF en " + config().mes + "/LISTAS.");
  fusionarAlumnos(lotes);
}

function importarAlumnosTexto() {
  const imp = hoja(HOJA.importar);
  if (imp.getLastRow() < 2) return aviso("Pega el texto en la pestaña «Importar» desde la celda A2.");
  const texto = imp.getRange(2, 1, imp.getLastRow() - 1, Math.max(1, imp.getLastColumn()))
    .getDisplayValues().map(f => f.join(" ")).join("\n");
  fusionarAlumnos([{ origen: "Texto pegado", texto }]);
}

/** Convierte el PDF a Google Doc temporal (Drive lo lee), extrae el texto y lo borra. */
function pdfATexto(file) {
  const tmp = Drive.Files.copy({ name: "_tmp_" + file.getName(), mimeType: MimeType.GOOGLE_DOCS },
                               file.getId(), { ocrLanguage: "es" });
  try { return DocumentApp.openById(tmp.id).getBody().getText(); }
  finally { DriveApp.getFileById(tmp.id).setTrashed(true); }
}

/** Saca { mes, alumnos:[{n, codigo, nombre}] } del texto del "Registro de evaluación". */
function leerRegistro(texto) {
  const t = texto.toUpperCase().replace(/ /g, " ");
  const alumnos = [];
  const re = /(?:^|\s)(\d{1,3})\s+(\d{4}[A-Z]\d{4})\s+([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ'.\- ]*[A-ZÁÉÍÓÚÑÜ])/g;
  let m;
  while ((m = re.exec(t))) alumnos.push({ n: Number(m[1]), codigo: m[2], nombre: m[3].replace(/\s+/g, " ").trim() });
  const mm = /MES\s+([A-ZÁÉÍÓÚ]+)/.exec(t), aa = /AÑO\s+(\d{4})/.exec(t);
  let mes = "";
  if (mm && aa) { const i = MESES_LARGOS.indexOf(mm[1].replace("SEPTIEMBRE", "SETIEMBRE")); if (i >= 0) mes = MESES[i] + " " + aa[1]; }
  return { mes, alumnos };
}

function fusionarAlumnos(lotes) {
  const sh = hoja(HOJA.alumnos);
  const tabla = leerTabla(sh);
  const porCodigo = {};
  tabla.filas.forEach(f => porCodigo[f.CODIGO] = f);

  let nuevos = 0, total = 0;
  const vistos = {}, avisos = [];
  const mesCfg = config().mes;
  lotes.forEach(l => {
    const r = leerRegistro(l.texto);
    if (r.mes && r.mes !== mesCfg) avisos.push(`«${l.origen}» es de ${r.mes} y el Panel está en ${mesCfg}.`);
    if (!r.alumnos.length) avisos.push(`No encontré alumnos en «${l.origen}».`);
    r.alumnos.forEach(a => {
      total++; vistos[a.codigo] = true;
      const f = porCodigo[a.codigo];
      if (f) {
        escribir(sh, tabla, f._fila, { "N LISTA": a.n, NOTA: f.NOTA === "Ya no figura en la lista" ? "" : f.NOTA });
      } else {
        sh.appendRow(filaDesde(tabla.cab, { CODIGO: a.codigo, "APELLIDOS Y NOMBRES": a.nombre, "N LISTA": a.n,
                                            ESTADO: "Pendiente", ORIGEN: l.origen }));
        porCodigo[a.codigo] = { _fila: sh.getLastRow() }; nuevos++;
      }
    });
  });

  // Quien vino de un PDF y ya no aparece en ninguno
  if (lotes.every(l => l.origen.indexOf("PDF") === 0)) {
    tabla.filas.forEach(f => {
      if (String(f.ORIGEN).indexOf("PDF") === 0 && !vistos[f.CODIGO])
        escribir(sh, tabla, f._fila, { NOTA: "Ya no figura en la lista" });
    });
  }
  ordenarAlumnos();
  actualizarLaboratorio();
  aviso(`Leídos ${total} alumnos · ${nuevos} nuevos.` + (avisos.length ? "\n\n⚠ " + avisos.join("\n⚠ ") : "") +
        "\n\nAhora asigna GRUPO (y PC) en la pestaña Alumnos cuando los conozcas.");
}

function ordenarAlumnos() {
  const sh = hoja(HOJA.alumnos);
  SpreadsheetApp.flush();   // asegura que las filas recién agregadas entren al orden
  if (sh.getLastRow() > 2)
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).sort({ column: colDe(sh, "APELLIDOS Y NOMBRES"), ascending: true });
}

/* ======================= GRUPOS, PCs Y LABORATORIO ======================= */

/** Al editar Alumnos: asignar grupo activa al alumno y renumera; cambios de PC refrescan el mapa. */
function onEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== HOJA.alumnos || e.range.getRow() < 2) return;
  const cGrupo = colDe(sh, "GRUPO"), cPC = colDe(sh, "PC"), cEstado = colDe(sh, "ESTADO");
  const c = e.range.getColumn();
  if (c <= cGrupo && cGrupo <= e.range.getLastColumn()) {
    const unaCelda = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
    for (let r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
      const grupo = sh.getRange(r, cGrupo).getValue();
      const est = sh.getRange(r, cEstado);
      if (grupo && (est.getValue() === "Pendiente" || !est.getValue())) est.setValue("Activo");
      // Cambió de grupo (o lo quitaste): pierde su número y se renumera en el grupo nuevo
      const cambio = unaCelda ? String(e.oldValue || "") !== String(e.value || "") : !grupo;
      if (cambio) sh.getRange(r, colDe(sh, "N")).clearContent();
    }
    numerarGrupos();
  }
  if ([cGrupo, cPC, cEstado].some(x => e.range.getColumn() <= x && x <= e.range.getLastColumn())) actualizarLaboratorio();
}

/** Da número de orden dentro de cada grupo (1, 2, 3…) a los activos que aún no tienen. Nunca cambia uno ya dado. */
function numerarGrupos() {
  const sh = hoja(HOJA.alumnos);
  const tabla = leerTabla(sh);
  const max = {};
  tabla.filas.forEach(f => { if (f.GRUPO && f.N) max[f.GRUPO] = Math.max(max[f.GRUPO] || 0, Number(f.N)); });
  tabla.filas.filter(f => f.GRUPO && !f.N && f.ESTADO === "Activo")
    .sort((a, b) => String(a["APELLIDOS Y NOMBRES"]).localeCompare(String(b["APELLIDOS Y NOMBRES"])))
    .forEach(f => { max[f.GRUPO] = (max[f.GRUPO] || 0) + 1; escribir(sh, tabla, f._fila, { N: max[f.GRUPO] }); });
}

const numPC = v => { const m = /\d+/.exec(String(v || "")); return m ? Number(m[0]) : null; };

function actualizarLaboratorio() {
  const cfg = config();
  const sh = hoja(HOJA.alumnos);
  const tabla = leerTabla(sh);
  const mapa = {};   // grupo -> pc -> [nombres]
  const activos = tabla.filas.filter(f => f.GRUPO && numPC(f.PC) && f.ESTADO === "Activo");
  activos.forEach(f => {
    const g = mapa[f.GRUPO] = mapa[f.GRUPO] || {};
    (g[numPC(f.PC)] = g[numPC(f.PC)] || []).push(f["APELLIDOS Y NOMBRES"]);
  });

  // Columna COMPARTE CON + color
  const cComp = colDe(sh, "COMPARTE CON");
  tabla.filas.forEach(f => {
    const lista = (f.GRUPO && numPC(f.PC) && f.ESTADO === "Activo") ? mapa[f.GRUPO][numPC(f.PC)] : [];
    const otros = (lista || []).filter(n => n !== f["APELLIDOS Y NOMBRES"]);
    sh.getRange(f._fila, cComp).setValue(otros.join(" + "));
    sh.getRange(f._fila, 1, 1, tabla.cab.length).setBackground(otros.length ? "#fef3c7" : null);
  });

  // Mapa del laboratorio
  const lab = hoja(HOJA.lab);
  lab.clear();
  const grupos = cfg.grupos;
  const usadas = activos.map(f => numPC(f.PC));
  const total = Math.max(Number(cfg.pcs) || 0, usadas.length ? Math.max.apply(null, usadas) : 0);
  const filas = [["PC"].concat(grupos)];
  const fondos = [Array(grupos.length + 1).fill(null)];
  for (let p = 1; p <= total; p++) {
    const fila = ["PC " + String(p).padStart(2, "0")], fondo = [null];
    grupos.forEach(g => {
      const n = (mapa[g] && mapa[g][p]) || [];
      fila.push(n.length ? (n.length > 1 ? "⚠ " : "") + n.join(" + ") : "— libre");
      fondo.push(n.length > 1 ? "#fde68a" : n.length ? null : "#f3f4f6");
    });
    filas.push(fila); fondos.push(fondo);
  }
  lab.getRange(1, 1, filas.length, filas[0].length).setValues(filas).setBackgrounds(fondos);
  estiloCabecera(lab, filas[0].length);
  grupos.forEach((g, i) => lab.setColumnWidth(i + 2, 360));
}

/* ======================= CLASES ======================= */

function nuevaClase() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt("Nueva clase o EC",
    "Escribe:\n  u1 4      → clase 4 de la unidad 1\n  u1 ec2    → evaluación continua 2 de la unidad 1\n\n" +
    "Clases: 1, 2, 4, 5, 7, 8 · EC: 1, 2, 3 (van en el lugar de la 3, 6 y 9)", ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const t = r1.getResponseText().toLowerCase().replace(/\s+/g, "");
  let m, info;
  if ((m = /^u(\d)c?(\d{1,2})$/.exec(t))) info = { tipo: "Clase", unidad: Number(m[1]), n: Number(m[2]) };
  else if ((m = /^u(\d)ec(\d)$/.exec(t))) info = { tipo: "EC", unidad: Number(m[1]), n: Number(m[2]) };
  else if ((m = /^ec(\d)u(\d)$/.exec(t))) info = { tipo: "EC", unidad: Number(m[2]), n: Number(m[1]) };
  else return aviso("No entendí «" + r1.getResponseText() + "». Ejemplos: u1 4  ·  u1 ec2");
  if (info.tipo === "Clase" && (info.n % 3 === 0 || info.n < 1 || info.n > 8))
    return aviso(info.n % 3 === 0 ? `La «clase ${info.n}» es la EC${info.n / 3}. Escribe: u${info.unidad} ec${info.n / 3}` : "Las clases van de la 1 a la 8 (sin 3 ni 6).");
  if (info.tipo === "EC" && (info.n < 1 || info.n > 3)) return aviso("Las EC van de la 1 a la 3.");
  info.id = info.tipo === "EC" ? `ec${info.n}u${info.unidad}` : `u${info.unidad}c${info.n}`;

  const cl = hoja(HOJA.clases), tabla = leerTabla(cl);
  if (tabla.filas.some(f => f.ID === info.id)) return aviso(info.id + " ya existe en la pestaña Clases.");

  const r2 = ui.prompt("Tema", "Tema de " + info.id + " (puedes dejarlo vacío):", ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  info.tema = r2.getResponseText().trim();

  const r3 = ui.prompt("Semilla",
    "¿Creo una semilla vacía para editar?\n  doc · hoja · presentacion\nDéjalo vacío si vas a subir/copiar tu propio archivo " +
    "(llámalo «SEMILLA …» o «profesor»).", ui.ButtonSet.OK_CANCEL);
  if (r3.getSelectedButton() !== ui.Button.OK) return;

  const mes = carpetaMes();
  const carpeta = subcarpeta(subcarpeta(mes, "U" + info.unidad), (info.tipo === "EC" ? "EC" : "C") + info.n + (info.tema ? " - " + info.tema : ""));
  subcarpeta(carpeta, "ALUMNOS");

  const tipoSemilla = r3.getResponseText().trim().toLowerCase();
  const nombreSemilla = "SEMILLA - profesor - " + info.id + (info.tema ? " - " + info.tema : "");
  let semilla = null;
  if (/^doc/.test(tipoSemilla)) semilla = DocumentApp.create(nombreSemilla).getId();
  else if (/^hoja|^sheet|^excel/.test(tipoSemilla)) semilla = SpreadsheetApp.create(nombreSemilla).getId();
  else if (/^pres|^diap|^slide/.test(tipoSemilla)) semilla = SlidesApp.create(nombreSemilla).getId();
  if (semilla) DriveApp.getFileById(semilla).moveTo(carpeta);

  cl.appendRow(filaDesde(tabla.cab, {
    ID: info.id, TIPO: info.tipo, UNIDAD: info.unidad, N: info.n, TEMA: info.tema,
    CARPETA: `=HYPERLINK("${carpeta.getUrl()}","abrir carpeta")`, PUBLICADA: false, COPIAS: 0
  }));
  cl.getRange(cl.getLastRow(), colDe(cl, "PUBLICADA")).insertCheckboxes();
  aviso(`Creada ${info.id}.\n\n` + (semilla ? "Edita la semilla en su carpeta" : "Pon tu archivo semilla en su carpeta") +
        " y luego usa Aula → Generar copias.");
}

/** Busca el archivo semilla: nombre que empieza con «SEMILLA» o «profesor». */
function semillaDe(carpeta) {
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const f = it.next(), n = f.getName().toLowerCase();
    if (n.indexOf("semilla") === 0 || n.indexOf("profesor") === 0) return f;
  }
  return null;
}

function carpetaDeClase(fila) {
  const m = /HYPERLINK\("[^"]*\/folders\/([\w-]+)/.exec(fila._formulas.CARPETA || "");
  return m ? DriveApp.getFolderById(m[1]) : null;
}

/* ======================= COPIAS ======================= */

function generarCopias() {
  const inicio = Date.now();
  numerarGrupos();
  const alumnos = leerTabla(hoja(HOJA.alumnos)).filas
    .filter(f => f.ESTADO === "Activo" && f.GRUPO && f.N)
    .sort((a, b) => (a.GRUPO + String(a.N).padStart(3, "0")).localeCompare(b.GRUPO + String(b.N).padStart(3, "0")));
  if (!alumnos.length) return aviso("No hay alumnos Activos con GRUPO asignado.");

  const shE = hoja(HOJA.entregas), tE = leerTabla(shE);
  const hechas = {};
  tE.filas.forEach(f => hechas[f.CLASE + "|" + f.CODIGO] = true);

  const shC = hoja(HOJA.clases), tC = leerTabla(shC, ["CARPETA"]);
  let creadas = 0, cortado = false;
  const sinSemilla = [], resumen = [];

  for (const clase of tC.filas) {
    const carpeta = carpetaDeClase(clase);
    if (!carpeta) { sinSemilla.push(clase.ID + " (sin carpeta)"); continue; }
    const semilla = semillaDe(carpeta);
    if (!semilla) { sinSemilla.push(clase.ID); continue; }
    const destino = subcarpeta(carpeta, "ALUMNOS");
    let n = 0;
    for (const a of alumnos) {
      if (hechas[clase.ID + "|" + a.CODIGO]) continue;
      if (Date.now() - inicio > LIMITE_MS) { cortado = true; break; }
      const nombre = `${a.GRUPO}-${String(a.N).padStart(2, "0")} - ${a["APELLIDOS Y NOMBRES"]} - ${clase.ID}`;
      const copia = semilla.makeCopy(nombre, destino);
      copia.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
      shE.appendRow(filaDesde(tE.cab, { CLASE: clase.ID, CODIGO: a.CODIGO, GRUPO: a.GRUPO, N: a.N,
        ALUMNO: a["APELLIDOS Y NOMBRES"], ENLACE: copia.getUrl(), ARCHIVO_ID: copia.getId(), CREADO: new Date() }));
      hechas[clase.ID + "|" + a.CODIGO] = true; n++; creadas++;
    }
    if (n) resumen.push(`${clase.ID}: ${n}`);
    if (cortado) break;
  }

  // Conteo de copias por clase
  const conteo = {};
  leerTabla(shE).filas.forEach(f => conteo[f.CLASE] = (conteo[f.CLASE] || 0) + 1);
  tC.filas.forEach(c => escribir(shC, tC, c._fila, { COPIAS: conteo[c.ID] || 0 }));

  aviso(`Copias creadas: ${creadas}` + (resumen.length ? "\n" + resumen.join(" · ") : "") +
        (sinSemilla.length ? "\n\nSin semilla (no se copiaron): " + sinSemilla.join(", ") : "") +
        (cortado ? "\n\n⏱ Se alcanzó el tiempo máximo. Vuelve a pulsar «Generar copias» para continuar." : ""));
}

/* ======================= CARPETAS ======================= */

function carpetaMes() {
  const cfg = config();
  const raiz = DriveApp.getFolderById(cfg.raiz);
  const it = raiz.getFoldersByName(cfg.mes);
  if (it.hasNext()) return it.next();
  const mes = raiz.createFolder(cfg.mes);
  ["LISTAS", "U1", "U2"].forEach(n => mes.createFolder(n));
  return mes;
}

function subcarpeta(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

function abrirCarpetaMes() {
  const url = carpetaMes().getUrl();
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(`<p><a href="${url}" target="_blank">Abrir ${config().mes}</a></p>`).setHeight(80), "Carpeta del mes");
}

/* ======================= UTILIDADES DE HOJA ======================= */

function hoja(nombre) {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
}

function config() {
  const v = {};
  const sh = hoja(HOJA.config);
  if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(([k, val]) => v[k] = val);
  return {
    mes: String(v.MES || "").trim().toUpperCase(),
    grupos: String(v.GRUPOS || "G1,G2").split(",").map(s => s.trim()).filter(Boolean),
    pcs: v.PCS,
    raiz: v.RAIZ_ID || DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents().next().getId()
  };
}

function colDe(sh, nombre) {
  const cab = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  const i = cab.indexOf(nombre);
  if (i < 0) throw new Error(`Falta la columna «${nombre}» en ${sh.getName()}. Usa Aula → Configurar panel.`);
  return i + 1;
}

/** Lee la hoja como objetos {COLUMNA: valor, _fila}. `conFormulas` guarda también las fórmulas de esas columnas. */
function leerTabla(sh, conFormulas) {
  const ultCol = Math.max(1, sh.getLastColumn()), ultFila = sh.getLastRow();
  const cab = sh.getRange(1, 1, 1, ultCol).getValues()[0].map(String);
  if (ultFila < 2) return { cab, filas: [] };
  const rango = sh.getRange(2, 1, ultFila - 1, ultCol);
  const vals = rango.getValues();
  const forms = conFormulas ? rango.getFormulas() : null;
  const filas = [];
  vals.forEach((fila, i) => {
    if (fila.every(x => x === "" || x === false)) return;
    const o = { _fila: i + 2, _formulas: {} };
    cab.forEach((c, j) => { o[c] = fila[j]; if (forms && conFormulas.indexOf(c) >= 0) o._formulas[c] = forms[i][j]; });
    filas.push(o);
  });
  return { cab, filas };
}

function escribir(sh, tabla, fila, cambios) {
  Object.keys(cambios).forEach(k => {
    const j = tabla.cab.indexOf(k);
    if (j >= 0) sh.getRange(fila, j + 1).setValue(cambios[k]);
  });
}

function filaDesde(cab, obj) { return cab.map(c => obj[c] === undefined ? "" : obj[c]); }

function validacionLista(sh, col, valores) {
  sh.getRange(2, col, sh.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(valores, true).setAllowInvalid(false).build());
}

function estiloCabecera(sh, n) {
  sh.getRange(1, 1, 1, n).setFontWeight("bold").setBackground("#1e3a8a").setFontColor("#ffffff");
  sh.setFrozenRows(1);
}

function aviso(msg) { SpreadsheetApp.getUi().alert(msg); }
