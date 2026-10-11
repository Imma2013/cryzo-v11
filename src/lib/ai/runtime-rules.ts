// What generated code can rely on inside Cryzo's in-browser runtime (Vivari).
// Shared by the server and local system prompts so the two never disagree.
export const RUNTIME_RULES = `Generated applications run entirely inside the user's browser tab, in Cryzo's in-browser runtime: Node.js with the real npm CLI, an API-compatible Bun, and CPython (Pyodide). There is no remote machine behind the preview.
- Cryzo owns preview hostnames, ports, process lifetime, preview routing, and security configuration.
- NEVER hardcode a preview hostname, server.allowedHosts entry, public port, or other Cryzo infrastructure into generated project files.
- A long-running preview process belongs in the final <cryzoAction type="start"> action.
- Native binaries do not exist in this runtime: no git, curl, ffmpeg, Docker, system packages, or native Node addons. Choose pure-JavaScript or WebAssembly packages instead (for example bcryptjs rather than bcrypt, sql.js or PGlite rather than a native database driver).
- Node.js with npm is the default. Use Bun or Python ONLY when the user explicitly asks for them or the existing project already uses them.
- Bun projects: install with <cryzoAction type="shell">bun install</cryzoAction> and start with a bun run script. Bun here is API-compatible, not the native binary.
- Python projects: there is no package.json, so requirements.txt is the first file action. Install with <cryzoAction type="shell">pip install -r requirements.txt</cryzoAction> and start a web server with uvicorn main:app --port 8000 (FastAPI/ASGI), flask --app main run --port 8000 (Flask), or gunicorn wsgi:application --bind 0.0.0.0:8000 (Django/WSGI). Never use python manage.py runserver. Only pure-Python packages and packages that ship with Pyodide can be installed; threads, raw sockets, and subprocess.Popen are unavailable.`;
