#!/usr/bin/env bash
# =============================================================
#  install-arch.sh — instala el "modo Finanzas" en tu Arch (bspwm + polybar)
#  * enlaza los comandos  finanzas  y  finanzas-mode  en ~/.local/bin
#  * añade el 4º botón (Finanzas) al módulo EnvMode de polybar (con copia de seguridad)
#  * añade los lanzadores al menú de aplicaciones
# =============================================================
set -euo pipefail
P="$(dirname "$(readlink -f "$0")")/app"
chmod +x "$P"/bin/* "$P"/conky/ticker.py
mkdir -p ~/.local/bin ~/.local/share/applications
ln -sfn "$P/bin/finanzas" ~/.local/bin/finanzas
ln -sfn "$P/bin/finanzas-mode" ~/.local/bin/finanzas-mode
for f in "$(dirname "$P")"/live/config/includes.chroot_after_packages/usr/share/applications/finanzasos-*.desktop; do
    sed -e "s#/opt/finanzas/bin/finanzas#$P/bin/finanzas#" -e "s#^Icon=finanzasos#Icon=$P/finanzas/static/logo.svg#" "$f" \
        > ~/.local/share/applications/"$(basename "$f")"
done
E=~/.config/bspwm/bin/EnvMode
if [ -f "$E" ] && ! grep -q "finance)" "$E"; then
    echo "AVISO: tu EnvMode aún no tiene el modo finanzas; restaura la versión parcheada o pide que se vuelva a aplicar."
fi
for dep in python python-flask python-numpy conky librsvg feh; do
    pacman -Q "$dep" >/dev/null 2>&1 || MISSING="${MISSING:-} $dep"
done
[ -n "${MISSING:-}" ] && echo "Instala las dependencias que faltan:  sudo pacman -S${MISSING}"
echo "Hecho. Pulsa el icono dorado del gráfico en tu polybar, o ejecuta: finanzas-mode on"
