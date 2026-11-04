#!/usr/bin/env bash
# =============================================================
#  build.sh — construye la ISO de FinanzasOS (Debian 13 + live-build)
#  Funciona desde cualquier distro con Docker o Podman (Arch incluido).
#  Resultado: dist/finanzasos-amd64.hybrid.iso
#
#  Uso: ./build.sh            construir
#       ./build.sh clean      borrar caché y artefactos de construcción
# =============================================================
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
ROOT=$PWD
INC=live/config/includes.chroot_after_packages
ENGINE=$(command -v docker || command -v podman || true)
[ -n "$ENGINE" ] || { echo "Necesitas docker o podman (sudo pacman -S docker)"; exit 1; }

if [ "${1:-}" = "clean" ]; then
    "$ENGINE" run --rm --privileged -v "$ROOT/live:/live" -w /live debian:trixie \
        bash -c "apt-get update -qq && apt-get install -y -qq live-build >/dev/null && lb clean --purge; rm -rf cache build.log"
    rm -rf "$INC/opt/finanzas" live/config/bootloaders
    exit 0
fi

echo "==> 1/3 Copiando la suite FinanzasOS a la imagen"
rm -rf "$INC/opt/finanzas"; mkdir -p "$INC/opt/finanzas"
cp -r app/finanzas app/conky app/branding app/bin app/guia "$INC/opt/finanzas/"
find "$INC/opt/finanzas" -name __pycache__ -prune -exec rm -rf {} +
rm -f "$INC/opt/finanzas/bin/finanzas-mode"       # solo para el modo Arch
[ -s "$INC/opt/finanzas/finanzas/static/vendor/lightweight-charts.standalone.production.js" ] || \
    curl -fsSL -o "$INC/opt/finanzas/finanzas/static/vendor/lightweight-charts.standalone.production.js" \
        https://unpkg.com/lightweight-charts@5.0.8/dist/lightweight-charts.standalone.production.js

echo "==> 2/3 Construyendo la ISO en un contenedor Debian trixie (20-60 min la primera vez)"
"$ENGINE" run --rm --privileged \
    -v "$ROOT/live:/live" -v "$ROOT/app/branding:/branding:ro" -w /live \
    -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" debian:trixie bash -euo pipefail -c '
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq live-build debootstrap xorriso squashfs-tools mtools dosfstools \
        syslinux syslinux-common isolinux grub-efi-amd64-bin grub-pc-bin librsvg2-bin python3 ca-certificates >/dev/null
    ./customize-bootloaders.sh                      # menú de arranque con la marca FinanzasOS
    lb clean >/dev/null 2>&1 || true
    lb config
    lb build
    chown -R "$HOST_UID:$HOST_GID" /live
'

echo "==> 3/3 Resultado"
mkdir -p dist
ISO=$(ls -t live/*.iso 2>/dev/null | head -1 || true)
[ -n "$ISO" ] || { echo "No se generó la ISO. Revisa live/build.log"; exit 1; }
mv "$ISO" dist/
( cd dist && sha256sum "$(basename "$ISO")" > "$(basename "$ISO").sha256" )
ls -lh dist/
echo "Listo. Copia dist/$(basename "$ISO") a tu USB con Ventoy, o grábala con Rufus (modo DD)."
