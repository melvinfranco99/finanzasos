#!/usr/bin/env bash
# Ejecuta la suite FinanzasOS en tu sistema actual sin construir la ISO.
# Requisitos: python3, python3-flask, python3-numpy (Arch: sudo pacman -S python-flask python-numpy)
cd "$(dirname "$(readlink -f "$0")")"
exec app/bin/finanzas "${1:-panel}" "${2:-}"
