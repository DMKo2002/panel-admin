#!/usr/bin/env python3
"""
Actualiza la seccion "Cambios recientes" en CLAUDE.md con los ultimos commits.
Se ejecuta automaticamente como git hook post-commit.
Tambien se puede correr manualmente: python scripts/update-claude-md.py
"""

import subprocess
import re
import os
import sys
from datetime import datetime

# Ruta al CLAUDE.md (un nivel arriba del repo Panel Admin)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
CLAUDE_MD = os.path.join(os.path.dirname(REPO_ROOT), "CLAUDE.md")

# Si no encuentra CLAUDE.md arriba, busca en el repo mismo
if not os.path.exists(CLAUDE_MD):
    CLAUDE_MD = os.path.join(REPO_ROOT, "CLAUDE.md")

if not os.path.exists(CLAUDE_MD):
    print(f"[hook] No se encontro CLAUDE.md en {CLAUDE_MD}")
    sys.exit(0)

# Obtener los ultimos 10 commits
result = subprocess.run(
    ["git", "log", "--oneline", "-10", "--pretty=format:%ad | %s | %an", "--date=short"],
    capture_output=True,
    text=True,
    cwd=REPO_ROOT
)

if result.returncode != 0:
    print(f"[hook] Error leyendo git log: {result.stderr}")
    sys.exit(0)

commits = result.stdout.strip()
if not commits:
    sys.exit(0)

# Formatear la seccion
lines = commits.split("\n")
formatted = []
for line in lines:
    parts = line.split(" | ", 2)
    if len(parts) == 3:
        date, msg, author = parts
        formatted.append(f"- `{date}` {msg}")
    else:
        formatted.append(f"- {line}")

updated_at = datetime.now().strftime("%Y-%m-%d %H:%M")
section = (
    "## Cambios recientes (Panel Admin)\n\n"
    f"_Actualizado automaticamente el {updated_at}_\n\n"
    + "\n".join(formatted)
    + "\n"
)

# Leer CLAUDE.md
with open(CLAUDE_MD, "r", encoding="utf-8") as f:
    content = f.read()

# Reemplazar la seccion si existe, o agregarla al final
SECTION_HEADER = "## Cambios recientes (Panel Admin)"

if SECTION_HEADER in content:
    # Reemplazar desde el header hasta el proximo ## o fin de archivo
    content = re.sub(
        r"## Cambios recientes \(Panel Admin\).*?(?=\n## |\Z)",
        section.rstrip(),
        content,
        flags=re.DOTALL
    )
else:
    # Agregar al final
    content = content.rstrip() + "\n\n---\n\n" + section

with open(CLAUDE_MD, "w", encoding="utf-8") as f:
    f.write(content)

print(f"[hook] CLAUDE.md actualizado con {len(formatted)} commits recientes")
