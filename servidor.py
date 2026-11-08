#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Servidor del Aula Virtual.

Sirve los archivos estáticos y, además, guarda los resultados de las
evaluaciones virtuales (ecv) en  ecv/resultados_<sesion>.json

Uso:
    python servidor.py            -> http://localhost:8000
    python servidor.py 8080       -> http://localhost:8080

Para que los resultados se guarden en los archivos del proyecto, los alumnos
deben entrar a la página a través de ESTE servidor (no con doble clic).
"""
import http.server
import socketserver
import json
import os
import sys
import threading
import urllib.parse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.abspath(__file__))
LOCK = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/guardar":
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(n).decode("utf-8"))
            sesion = (data.get("sesion") or "").strip().lower()
            codigo = (data.get("codigo") or "").strip()
            codigos = [str(c).strip() for c in (data.get("codigos") or []) if str(c).strip()]
            borrar = bool(data.get("borrar"))
            resultado = data.get("resultado")
            if not sesion or (not codigo and not codigos):
                self.send_error(400)
                return
            self._guardar(sesion, codigo, codigos, resultado, borrar)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
        except Exception as e:  # noqa: BLE001
            try:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode("utf-8"))
            except Exception:  # noqa: BLE001
                pass

    def _guardar(self, sesion, codigo, codigos, resultado, borrar):
        with LOCK:
            # por seguridad: solo letras, números y guiones en el nombre
            sesion = "".join(c for c in sesion if c.isalnum() or c in "-_")
            archivo = os.path.join(ROOT, "ecv", f"resultados_{sesion}.json")
            os.makedirs(os.path.dirname(archivo), exist_ok=True)
            todo = {}
            if os.path.exists(archivo):
                try:
                    with open(archivo, "r", encoding="utf-8") as f:
                        todo = json.load(f)
                except Exception:  # noqa: BLE001
                    todo = {}
            if codigos:
                for c in codigos:
                    todo.pop(c, None)
            elif borrar:
                todo.pop(codigo, None)
            else:
                todo[codigo] = resultado
            tmp = archivo + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(todo, f, ensure_ascii=False, indent=2)
            os.replace(tmp, archivo)

    def log_message(self, fmt, *args):
        line = fmt % args
        if "/api/" in line:
            sys.stderr.write(line + "\n")


if __name__ == "__main__":
    with socketserver.ThreadingTCPServer(("", PORT), Handler) as httpd:
        print(f"Aula Virtual en http://localhost:{PORT}")
        print("Resultados de evaluaciones -> ecv/resultados_*.json")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nDetenido.")
