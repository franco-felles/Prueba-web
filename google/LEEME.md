# Panel Aula Virtual (Google Sheets + Apps Script)

`panel.gs` es el código del **Panel Aula Virtual** (la hoja de Google que está en la carpeta `AULA VIRTUAL` de Drive). Desde ahí se manejan alumnos, grupos, PCs, clases y copias.

## Instalar (una sola vez)

1. Abre la hoja **Panel Aula Virtual** en Drive.
2. **Extensiones → Apps Script**. Borra lo que haya y pega todo `panel.gs`. Guarda (💾).
3. En el panel izquierdo: **Servicios (+) → Drive API → Añadir**.
4. Vuelve a la hoja y recárgala (F5). Aparece el menú **Aula**.
5. **Aula → Configurar panel**. Google pedirá permisos la primera vez: elige tu cuenta → *Configuración avanzada* → *Ir a … (no seguro)* → *Permitir*. (Sale "no seguro" porque el script es tuyo y no está publicado; es normal.)

## Uso mensual

| Momento | Qué haces |
|---|---|
| Inicio de mes | En `Config` cambia `MES` (ej. `DIC 2026`) → se crea la carpeta del mes. Deja los PDF de la institución en `<MES>/LISTAS` → **Aula → Importar alumnos (PDF)** |
| Primera clase | En `Alumnos` elige el **GRUPO** de cada uno (queda *Activo* y recibe su número dentro del grupo) y escribe su **PC** (solo el número: `7`). En `Config` → `PCS` pon cuántas PC tiene la sede |
| Nueva clase | **Aula → Nueva clase / EC** (`u1 4` o `ec2`), edita la semilla en su carpeta |
| Antes de clase | **Aula → Generar copias** (solo crea las que faltan; sirve también para alumnos tardíos) |
| Alumno tardío | Escríbelo en una fila nueva de `Alumnos` (código, nombre, grupo) → **Generar copias** |

## Pestañas

- **Alumnos**: `CODIGO, APELLIDOS Y NOMBRES, N LISTA, ESTADO, GRUPO, N, PC, COMPARTE CON, ORIGEN, NOTA`. `COMPARTE CON` se calcula solo; las filas que comparten PC se pintan de amarillo.
- **Laboratorio**: mapa PC × grupo, automático.
- **Clases**: una fila por clase o EC (`u1c04`, `ec2`), con enlace a su carpeta y el conteo de copias.
- **Entregas**: el enlace de la copia de cada alumno en cada clase (lo llena el script).
- **Enlaces**: enlaces, videos, encuestas o juegos que se mostrarán en una clase (`PARA` = Todos, G1 o G2).
- **Importar**: plan B si el PDF no se lee: pega ahí el texto copiado del PDF.

## Dónde va cada cosa

| Tengo… | Lo pongo en… |
|---|---|
| Archivo que **cada alumno trabaja** | La carpeta de la clase, con nombre que empiece por `SEMILLA` o `profesor` |
| Archivo **para ver** (PPT, PDF, Form…) | La carpeta de la clase (fuera de `ALUMNOS/`) |
| **Enlace** externo (web, YouTube, Kahoot…) | Una fila en la pestaña `Enlaces` |
| **Juego o página HTML** propia | El repo: `material/<id-clase>/index.html` |
