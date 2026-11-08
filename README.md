# aula-virtual

Portal de *Herramientas Informáticas*. Los datos (alumnos, clases, copias, enlaces, quizzes y notas) viven en el **Panel Aula Virtual** (Google Sheets + Apps Script, en tu Drive). La web solo muestra lo que el Panel le permite ver a quien inició sesión.

## Cómo encaja todo

```
Google Drive / AULA VIRTUAL/
  Panel Aula Virtual  ← hoja de control + Apps Script (google/panel.gs + google/api.gs)
  BIBLIOTECA/         ← semillas reutilizables
  NOV 2026/           ← carpeta del mes (LISTAS, U1/C01 - Tema/, U2/, EC1..3/)

Web (Vercel)
  acceso.html         login: alumno con su código · docente con contraseña
  index.html          portal: unidades, evaluaciones continuas, quizzes
  clase.html?id=…     cada clase/EC como CARPETA (mi documento, actividades, archivos, enlaces, quiz)
  quiz.html?id=…      rendir quiz (alumno) / resultados y corrección (docente)
  docente/quizzes.html  crear y editar quizzes
  clases/<id>/        complementos HTML de cada clase (ver nomenclatura)
  config.js           URL del Panel publicado (/exec)
  access/aula.js      sesión, API, cierre por inactividad
```

## Nomenclatura: dónde va cada cosa

Los IDs de clase los crea el Panel: `u1c04` = unidad 1, clase 4 · `ec2` = evaluación continua 2.

| Tengo… | Va en… | Aparece en la carpeta de la clase como |
|---|---|---|
| Documento que **cada alumno trabaja** (Doc/Sheet, aunque esté vacío) | Drive, carpeta de la clase, nombre que empieza por `SEMILLA` o `profesor` → Panel: **Aula → Generar copias** | **Mi documento** (cada uno ve el suyo) |
| Presentación, PDF, video, Form **para ver** | Drive, carpeta de la clase (fuera de `ALUMNOS/`) | **Presentaciones y archivos** |
| Enlace a un Doc/Sheet compartido, web, YouTube, Kahoot… | Panel → pestaña **Enlaces** (`TIPO`: documento, hoja, presentacion, encuesta, video, web, juego, enlace) | **Enlaces** |
| Página HTML propia (material interactivo) | `clases/<id>/pag-<nombre>.html` | **Actividades** |
| Juego HTML propio | `clases/<id>/juego-<nombre>.html` | **Juegos** |
| Quiz de opción múltiple | Web → **Mis quizzes** (vincúlalo a la clase) | **Evaluación virtual** |

- Un archivo de Drive cuyo nombre empieza con `_` no se muestra (borradores).
- En `clases/<id>/` puedes poner imágenes, `.js` o `.css` que usen tus páginas; solo `pag-*` y `juego-*` aparecen como tarjetas.
- El título de la tarjeta sale de `<meta name="session-title" content="…">` o del `<title>` de la página.
- Las evaluaciones continuas funcionan igual que una clase: su semilla se copia para cada alumno y cada uno abre **su** documento.

### Complementos HTML

Cabecera mínima de una página en `clases/<id>/`:

```html
<script src="../../access/aula.js" data-proteger></script>
```

Para un botón "Ir a mi documento" dentro de la página:

```js
const docs = await Aula.miDocumento();          // [{nombre, url}] de quien está conectado
docs.filter(d => d.url).forEach(d => window.open(d.url, "_blank", "noopener"));
```

`clases/manifiesto.json` (la lista de complementos) se regenera solo con GitHub Actions al subir cambios en `clases/`. A mano: `node tools/manifiesto.js`.

`biblioteca/` guarda páginas antiguas listas para reutilizar: cópialas a `clases/<id>/`.

## Accesos

- **Alumno**: escribe su código. Solo entra si en el Panel está **Activo y con grupo**. Si comparte PC, su compañero se agrega desde el portal ("Agregar compañero") y cada uno ve su propio documento.
- **Docente**: contraseña guardada cifrada en Apps Script (no en la hoja ni en la web). Se cambia desde el portal (**Cambiar contraseña**) o, si la olvidas, en el Panel: **Aula → Contraseña docente**.
- La sesión vive solo en esa pestaña y se cierra sola tras **20 minutos sin uso** (PC compartidas).

## Quizzes

- Se crean en **Mis quizzes**: preguntas con 2 a 5 alternativas, tema opcional, cuántas mostrar al azar, abierto/cerrado y clase vinculada.
- Se pueden importar preguntas en el formato del quiz antiguo (`N,TEMA,PREGUNTA,A,B,C,D,E`, correcta con `*`); ej. `biblioteca/quiz-ecvfu2.csv`.
- El navegador del alumno **nunca recibe las respuestas correctas**: corrige el Panel. Un intento por alumno; detecta cambios de pestaña.
- Notas en la pestaña **Resultados** del Panel; corrección de nota y reinicio desde la web.

## Instalación

Ver [`google/LEEME.md`](google/LEEME.md).
