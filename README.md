# aula-virtual

Portal de *Herramientas Informáticas*. Cada persona entra con su código; el portal arma **solo** los botones de clases y evaluaciones según los CSV que existan. Para publicar algo nuevo **solo se sube un CSV** con el nombre correcto.

## Estructura

```
index.html             portal (crea los botones solos). Sin sesión te manda al login
acceso.html            login
access/
  access.csv           quién puede entrar (alumnos + docente)
  access.js            validación, sesión y guardia de páginas
  estilo.css           diseño compartido
  icono.png / favicon.png / login.jpg   logo, icono de pestaña e ilustración del login
  sesion.html          ÚNICA página de sesión (ver abajo)
clases/
  class1u1.html        única clase que es página (modelo 3D de la PC); no lleva CSV
  class2u1.csv         código + enlace de cada alumno en esa clase
  class4u1.csv
  class5u1.csv
eecc/
  ec1u1.csv            evaluación continua (mismo formato que los CSV de clase)
ecv/
  ecvfu2.csv           banco de preguntas de la evaluación virtual (quiz)
  examen.html          ÚNICA página de quiz (alumno rinde, docente corrige)
  config.js            URL de Google Apps Script para guardar resultados
  appsscript.gs        código del backend (se pega en script.google.com)
  resultados_ecvfu2.json  resultados (solo si usas servidor.py)
review/
  reu1u1.html          repaso de la unidad 1 (página; no lleva CSV)
servidor.py            servidor local OPCIONAL (solo para probar sin Google)
```

## Nomenclatura

| Tipo | Nombre | Carpeta | Ejemplo |
|---|---|---|---|
| Clase | `class#u#` (clase # de la unidad #) | `clases/` | `class4u1.csv`, `class2u2.csv` |
| Evaluación continua | `ec#u#` | `eecc/` | `ec1u1.csv`, `ec2u1.csv` |
| Repaso | `reu#u#` (repaso # de la unidad #) | `review/` | `reu1u1.html`, `reu2u1.html` |
| Evaluación virtual (quiz) | `ecv<etiqueta>u#` (F = Final, P = Parcial…) | `ecv/` | `ecvfu2.csv` |

La **primera fila** del CSV repite el nombre de la sesión (`class4u1`) y debe coincidir con el nombre del archivo. Segunda fila (encabezados): `N_ORDEN,GRUPO,CODIGO,ALUMNO,ENLACE`. Si el enlace no empieza con `http` (ej. `NO_DISPONIBLE`) se avisa que el documento aún no está disponible.

`access.csv`: `ROL,GRUPO,CODIGO,NOMBRE` (ROL = `alumno` o `docente`).

## Cómo funciona

1. El alumno busca su nombre, escribe su código y entra. El código queda como llave **solo en esa pestaña** (`sessionStorage`; en el laboratorio las PC se comparten). Hay botón **Salir**.
2. El portal detecta los CSV de `clases/` y `eecc/` y crea un botón por cada uno (agrupados por unidad).
3. **Alumno**: el portal busca su código en cada CSV y convierte cada botón en un enlace a **su documento**. Al presionarlo, el documento se abre en una **pestaña nueva**, el portal sigue abierto y aparece una **notificación** en pantalla. Si no tiene enlace o no figura en ese CSV, el botón sale deshabilitado ("Aún no disponible" / "No figuras aquí").
   **Docente**: el botón abre `access/sesion.html?s=<sesión>`:
   - ve la lista de todos los alumnos de esa clase/evaluación con su enlace (buscador y filtro por grupo; cada nombre abre su documento en pestaña nueva).

`sesion.html` es el único modelo: sirve para cualquier clase o evaluación, no hay que crear HTML por sesión. (Si un alumno entra a `sesion.html?s=...` directamente, lo redirige a su enlace.)

Imágenes: `access/icono.png` (logo de las cabeceras), `access/favicon.png` (icono de pestaña) y `access/login.jpg` (ilustración del login). Se cambian reemplazando el archivo.

## Agregar cosas

| Quiero… | Hago |
|---|---|
| Publicar una clase | Subo `clases/class6u1.csv`. El botón aparece solo. |
| Publicar una EC | Subo `eecc/ec2u1.csv` |
| Publicar un repaso | Subo `review/reu2u1.html` (copia de `reu1u1.html`; cambia `data-sesion="reu2u1"`) |
| Clase de otra unidad | `class1u2.csv` |
| Agregar/quitar un alumno | Edito `access/access.csv` (y los CSV de cada sesión) |
| Cambiar mi clave de docente | Última fila de `access/access.csv` (`docente`, columna CODIGO) |

Búsqueda automática (en `index.html`): se prueban las unidades de `UNIDADES = [1,2,3,4]` y, en cada una, los números 1, 2, 3… hasta que falten 3 seguidos (`HUECOS`). Si en la consola (F12) ves errores 404, son normales: el portal prueba nombres que aún no existen.

## Evaluación virtual (quiz en plataforma)

Tipo `ecv`: un examen en diapositivas, distinto a las EC (que son enlaces a documentos).

| Archivo | Función |
|---|---|
| `ecv/ecvfu2.csv` | Banco de preguntas (más de 10; se muestran 10 al azar) |
| `ecv/examen.html` | Página única: el alumno rinde, el docente corrige |
| `ecv/resultados_ecvfu2.json` | Resultados (lo escribe `servidor.py`) |

**Banco de preguntas** (`ecv/ecvfu2.csv`), una pregunta por fila:

```
ecvfu2
N,TEMA,PREGUNTA,A,B,C,D,E
1,Hojas de cálculo,¿Con qué símbolo comienza toda fórmula?,Igual (=)*,Más (+),Asterisco (*),Diagonal (/),
```

- Primera fila: nombre de la sesión (igual al archivo).
- Encabezados: `N,TEMA,PREGUNTA,A,B,C,D,E`. `TEMA` es opcional.
- Alternativas de `A` a `E` (usa las que necesites). **La correcta lleva `*` al final** (ej. `Igual (=)*`).
- Solo una correcta por pregunta. El orden de preguntas y de alternativas se baraja automáticamente.

**Resultado por alumno** (clave = código):

```json
{
  "2026D2287": {
    "aciertos": 8, "total": 10, "hora": "2026-11-03T23:00:00-05:00",
    "incidentes": 0, "correccion": null,
    "respuestas": [ { "n": 1, "orden": ["B","A","C"], "elegida": "A", "ok": true } ]
  }
}
```

Solo se guardan códigos y letras (el nombre del alumno sale de `access/access.csv`). Dónde se guarda depende de cómo publiques:

- **En Vercel (lo normal)**: se guarda en **Google Apps Script** (tu cuenta de Google). Ver "Guardar resultados sin servidor propio".
- **Con `servidor.py` en local**: se guarda en `ecv/resultados_ecvfu2.json`.

**Alumno**: 10 preguntas al azar, alternativas barajadas, sin volver atrás. Detecta cambio de pestaña o minimizado y lo registra (anti-trampa). Al terminar solo ve su nota y "Finalizar todo"; si vuelve a entrar, solo ve su nota.

**Docente**: en `ecv/examen.html?s=ecvfu2` ve los alumnos por grupo. Al hacer clic en un nombre: las preguntas que le salieron, aciertos/desaciertos (amarillo = correcta, rojo = fallo), nota, hora e incidentes, botón **Reiniciar evaluación** y un campo de **nota de corrección** (la original sale tachada).

**Agregar otra evaluación virtual**: crea `ecv/ecvfu3.csv` (u `ecvpu2.csv` para parcial) y añade su etiqueta en `ECV_LABELS` de `index.html` (ej. `["f", "p"]`).

## Guardar resultados sin servidor propio (Google Apps Script)

En Vercel el navegador no puede escribir archivos, así que las notas de las evaluaciones virtuales se guardan en **Google** con un mini-servidor gratuito (Apps Script) y se ven desde la misma página. Se configura **una sola vez** (≈5 minutos):

1. Entra a <https://script.google.com> con tu cuenta de Google y pulsa **Nuevo proyecto**.
2. Borra todo lo que hay y pega el contenido de [`ecv/appsscript.gs`](ecv/appsscript.gs).
3. Guarda (nombre sugerido: `Resultados Aula Virtual`).
4. Arriba a la derecha: **Implementar → Nueva implementación → tipo "Aplicación web"**:
   - Ejecutar como: **Yo** (tu correo).
   - Quién tiene acceso: **Cualquier persona**.
   - Pulsa **Implementar** y autoriza los permisos cuando te lo pida.
5. Copia la **URL de la aplicación web** (termina en `/exec`).
6. Abre [`ecv/config.js`](ecv/config.js) y pega esa URL entre las comillas:
   ```js
   window.CONFIG_ECV_API = "https://script.google.com/macros/s/AKfycb.../exec";
   ```
7. Sube el cambio: `git add ecv/config.js && git commit -m "backend resultados" && git push`.

Con eso los alumnos rinden en `web-herramientas-informaticas.vercel.app` y sus notas quedan guardadas en Google; tú las ves desde la pestaña docente desde cualquier PC.

> Nota: esa URL es "pública" (quien la conozca podría leer o escribir resultados). Para un aula de ofimática no es un problema real; más adelante se puede proteger con una clave.

## ⚠️ Seguridad

Es un sitio estático: **todos los CSV son públicos** para quien conozca su dirección (nombres, códigos y enlaces, incluida la clave del docente). El login evita curiosos, no es seguridad real. Para ocultar la clave del docente, ejecuta en la consola `await Acceso.hash("tu clave")` y pega el resultado (`sha256:...`) en `access.csv`. Si los documentos de Google están como "cualquiera con el enlace: editor", quien consiga un CSV puede abrirlos.

## Probar en local (opcional)

Solo si quieres probar sin Google. `fetch` no funciona con doble clic; desde la carpeta del proyecto:

- Ver el sitio: `python3 -m http.server 8000` → `http://localhost:8000`.
- Guardar resultados en `ecv/resultados_*.json` (sin Apps Script): `python servidor.py` → `http://localhost:8000`.

Si `ecv/config.js` tiene la URL de Apps Script, esa tiene prioridad y no hace falta `servidor.py`. El nombre de archivo `ecv/ecvfu2.csv` se escribe en minúsculas aunque escribas `ecvFu2`: el portal no distingue mayúsculas.
