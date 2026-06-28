# install-hooks.ps1
# Instala el git hook post-commit en Panel Admin.
# Ejecutar UNA SOLA VEZ desde la carpeta "Panel Admin":
#   powershell -ExecutionPolicy Bypass -File scripts\install-hooks.ps1

$RepoRoot = Split-Path -Parent $PSScriptRoot
$HooksDir = Join-Path $RepoRoot ".git\hooks"
$HookFile = Join-Path $HooksDir "post-commit"

# Contenido del hook (llama al script Python)
$HookContent = @"
#!/bin/sh
python "$RepoRoot\scripts\update-claude-md.py"
"@

# Escribir el hook
Set-Content -Path $HookFile -Value $HookContent -Encoding UTF8
Write-Host "Hook instalado en: $HookFile"
Write-Host "A partir de ahora, CLAUDE.md se actualiza automaticamente en cada commit."
