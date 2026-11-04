#!/bin/bash
# Personaliza el menú de arranque (se ejecuta dentro del contenedor de build.sh, en /live)
set -euo pipefail
B=config/bootloaders
rm -rf "$B"; mkdir -p "$B"
cp -rL /usr/share/live/build/bootloaders/isolinux /usr/share/live/build/bootloaders/grub-pc "$B/"
cp /branding/splash.svg "$B/splash.svg"                                  # imagen de fondo del menú (BIOS y UEFI)
sed -i 's/^timeout 0/timeout 50/' "$B/isolinux/isolinux.cfg"           # BIOS: arranca solo a los 5 s
sed -i '1i set timeout=5' "$B/grub-pc/config.cfg"                       # UEFI: arranca solo a los 5 s
sed -i 's|^title-text:.*|title-text: ""|' "$B/grub-pc/live-theme/theme.txt"
python3 - "$B/grub-pc/grub.cfg" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
entries = '''menuentry "FinanzasOS - sistema en vivo" --hotkey=l {
	linux	@KERNEL_LIVE@ @APPEND_LIVE@
	initrd	@INITRD_LIVE@
}
menuentry "FinanzasOS - copiar a la RAM (más rápido, puedes retirar el USB)" --hotkey=r {
	linux	@KERNEL_LIVE@ @APPEND_LIVE@ toram
	initrd	@INITRD_LIVE@
}
menuentry "FinanzasOS - modo seguro (gráficos básicos)" --hotkey=s {
	linux	@KERNEL_LIVE@ @APPEND_LIVE@ nomodeset
	initrd	@INITRD_LIVE@
}'''
assert "@LINUX_LIVE@" in s
open(p, "w").write(s.replace("@LINUX_LIVE@", entries))
PY
echo "Menú de arranque personalizado"
