#!/usr/bin/env bash
# 在 Linux 桌面安装「突发监听」启动器图标
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ID="tufa-jianting"
ICON_DIR="${HOME}/.local/share/icons/hicolor/256x256/apps"
APP_DIR="${HOME}/.local/share/applications"
DESKTOP_DIR="${HOME}/Desktop"
ICON_SRC_SVG="${ROOT}/electron/icon.svg"
ICON_SRC_PNG="${ROOT}/electron/icon.png"
ICON_DST="${ICON_DIR}/${APP_ID}.png"

mkdir -p "${ICON_DIR}" "${APP_DIR}" "${DESKTOP_DIR}"

if command -v convert >/dev/null 2>&1 && [[ -f "${ICON_SRC_SVG}" ]]; then
  convert -background none "${ICON_SRC_SVG}" -resize 256x256 "${ICON_DST}"
elif [[ -f "${ICON_SRC_PNG}" ]]; then
  cp -f "${ICON_SRC_PNG}" "${ICON_DST}"
else
  cp -f "${ICON_SRC_SVG}" "${HOME}/.local/share/icons/${APP_ID}.svg"
  ICON_DST="${HOME}/.local/share/icons/${APP_ID}.svg"
fi

# Prefer local electron binary
ELECTRON_BIN="${ROOT}/node_modules/.bin/electron"
if [[ ! -x "${ELECTRON_BIN}" ]]; then
  ELECTRON_BIN="$(command -v electron || true)"
fi
if [[ -z "${ELECTRON_BIN}" ]]; then
  echo "未找到 electron。请先在项目根目录执行: npm install" >&2
  exit 1
fi

EXEC_LINE="${ELECTRON_BIN} ${ROOT}"

write_desktop() {
  local target="$1"
  cat > "${target}" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=突发监听
Name[zh_CN]=突发监听
Comment=欧美与国内公开突发线索桌面雷达
Exec=${EXEC_LINE}
Icon=${ICON_DST}
Terminal=false
Categories=Network;News;
StartupNotify=true
EOF
  chmod +x "${target}"
}

write_desktop "${APP_DIR}/${APP_ID}.desktop"
write_desktop "${DESKTOP_DIR}/${APP_ID}.desktop"

# Mark trusted on some desktops (GNOME)
if command -v gio >/dev/null 2>&1; then
  gio set "${DESKTOP_DIR}/${APP_ID}.desktop" metadata::trusted true 2>/dev/null || true
fi

update-desktop-database "${APP_DIR}" 2>/dev/null || true

echo "已安装桌面图标:"
echo "  ${DESKTOP_DIR}/${APP_ID}.desktop"
echo "  ${APP_DIR}/${APP_ID}.desktop"
echo "  图标: ${ICON_DST}"
echo "双击桌面图标即可启动（需已 npm install）。"
