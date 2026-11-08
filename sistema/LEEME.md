# Panel Aula Virtual (Google Sheets + Apps Script)

Dos archivos en el **mismo** proyecto de Apps Script del Panel:

- `panel.gs` → menú **Aula** (importar alumnos, grupos, PCs, clases, copias).
- `api.gs` → lo que la web le pide al Panel (login, clases, quizzes).

## Instalar / actualizar el código

1. Panel Aula Virtual → **Extensiones → Apps Script**.
2. Archivo `Código.gs`: borra todo y pega `panel.gs`.
3. **Archivos → + → Secuencia de comandos**, llámalo `api` y pega `api.gs`.
4. Guarda (💾). Debe estar el servicio **Drive** (Servicios → + → Drive API).
5. Recarga la hoja → **Aula → Configurar panel** (actualiza listas desplegables; no borra datos).
6. **Aula → Contraseña docente…** → crea tu contraseña de la web.

## Publicar para la web (una vez)

1. En Apps Script: **Implementar → Nueva implementación** → ⚙ → **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
2. **Implementar** → autoriza → copia la **URL de la aplicación web** (termina en `/exec`).
3. Pégala en `conexion/config.js` de la web: `window.AULA_API = "https://script.google.com/macros/s/…/exec";`

### Cuando cambie el código de `api.gs` o `panel.gs`

Pega el código nuevo y luego: **Implementar → Gestionar implementaciones → ✏ (editar) → Versión: Nueva versión → Implementar**. Así la URL no cambia. (Si haces "Nueva implementación" se crea otra URL distinta.)

## Uso mensual

| Momento | Qué haces |
|---|---|
| Inicio de mes | `Config → MES` (ej. `DIC 2026`) → se crea la carpeta. PDF de la institución en `<MES>/LISTAS` → **Aula → Importar alumnos (PDF)** |
| Primera clase | `Config → PCS` con las PC de la sede. En `Alumnos`: **GRUPO** (queda *Activo* y numerado) y **PC** (solo el número) |
| Nueva clase | **Aula → Nueva clase / EC** (`u1 4` o `u1 ec2`) → edita la semilla en su carpeta |
| Antes de clase | Pon una o varias semillas en la carpeta de la clase (`SEMILLA - Práctica Excel`, `SEMILLA - Informe`…) → **Aula → Generar copias** (solo crea las que faltan; cubre tardíos y semillas nuevas) → marca **PUBLICADA** en `Clases` |
| Alumno tardío | Fila nueva en `Alumnos` (código, nombre, grupo) → **Generar copias** |

## Pestañas

- **Config**: `MES`, `GRUPOS`, `PCS`, `RAIZ_ID`, `DOCENTE` (tu nombre en la web).
- **Alumnos**: `CODIGO, APELLIDOS Y NOMBRES, N LISTA, ESTADO, GRUPO, N, PC, COMPARTE CON, ORIGEN, NOTA`.
- **Laboratorio**: mapa PC × grupo (automático; amarillo = PC compartida).
- **Clases**: `ID, TIPO, UNIDAD, N, TEMA, CARPETA, PUBLICADA, COPIAS`. Solo las PUBLICADAS se ven en la web.
- **Entregas**: enlace de la copia de cada alumno en cada clase (automático).
- **Enlaces**: `CLASE, ORDEN, TIPO, TITULO, URL, PARA` (Todos / G1 / G2).
- **Quiz** y **Resultados**: los llena la web (Mis quizzes). En Resultados ves todas las notas.
- **Importar**: plan B si el PDF no se lee (pega el texto).
