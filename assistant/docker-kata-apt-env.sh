#!/usr/bin/env sh

. /app/assistant/docker-kata-runtime-family.sh

if ! forge_is_kata_family_runtime; then
  return 0 2>/dev/null || exit 0
fi

export FORGE_APT_DATA_ROOT="${FORGE_APT_DATA_ROOT:-/data/system}"

_forge_kata_append_path() {
  case ":${PATH:-}:" in
    *":$1:"*) ;;
    *) PATH="${PATH:+${PATH}:}$1" ;;
  esac
}

_forge_kata_prepend_path() {
  case ":${PATH:-}:" in
    *":$1:"*) ;;
    *) PATH="$1${PATH:+:${PATH}}" ;;
  esac
}

_forge_kata_append_pythonpath() {
  case ":${PYTHONPATH:-}:" in
    *":$1:"*) ;;
    *) PYTHONPATH="${PYTHONPATH:+${PYTHONPATH}:}$1" ;;
  esac
}

_forge_kata_prepend_library_path() {
  case ":${LD_LIBRARY_PATH:-}:" in
    *":$1:"*) ;;
    *) LD_LIBRARY_PATH="$1${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}" ;;
  esac
}

_forge_kata_append_path "${FORGE_APT_DATA_ROOT}/bin"
_forge_kata_append_path "${FORGE_APT_DATA_ROOT}/usr/local/sbin"
_forge_kata_append_path "${FORGE_APT_DATA_ROOT}/usr/local/bin"
_forge_kata_append_path "${FORGE_APT_DATA_ROOT}/usr/sbin"
_forge_kata_append_path "${FORGE_APT_DATA_ROOT}/usr/bin"
_forge_kata_append_path "${FORGE_APT_DATA_ROOT}/sbin"
_forge_kata_append_path "${FORGE_APT_DATA_ROOT}/usr/games"
_forge_kata_append_path "${FORGE_APT_DATA_ROOT}/games"
export PATH

_forge_kata_prepend_library_path "${FORGE_APT_DATA_ROOT}/usr/lib/aarch64-linux-gnu"
_forge_kata_prepend_library_path "${FORGE_APT_DATA_ROOT}/usr/lib/x86_64-linux-gnu"
_forge_kata_prepend_library_path "${FORGE_APT_DATA_ROOT}/usr/lib"
_forge_kata_prepend_library_path "${FORGE_APT_DATA_ROOT}/usr/local/lib"
export LD_LIBRARY_PATH

# Make python packages installed into the chroot importable by the image
# python: apt packages land in the unversioned dist-packages dir, chroot pip
# installs in the versioned /usr/local one. The chroot suite matches the image
# suite, so the image python's version selects the right pip dir. The pip dir
# must precede the apt dir, mirroring Debian's sys.path order, so a
# pip-upgraded package wins over an older apt one.
_forge_kata_python_version="$(/usr/bin/python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || true)"
if [ -n "${_forge_kata_python_version}" ]; then
  _forge_kata_append_pythonpath "${FORGE_APT_DATA_ROOT}/usr/local/lib/python${_forge_kata_python_version}/dist-packages"
fi
_forge_kata_append_pythonpath "${FORGE_APT_DATA_ROOT}/usr/lib/python3/dist-packages"
unset _forge_kata_python_version
export PYTHONPATH

# The image bakes these under /home/assistant, which is ephemeral rootfs; on
# kata pods $HOME is the persistent data volume, so user-level installs there
# survive machine saves.
if [ -n "${HOME:-}" ]; then
  export PYTHONUSERBASE="${HOME}/.python"
  export BUN_INSTALL="${HOME}/.bun"
  _forge_kata_prepend_path "${BUN_INSTALL}/bin"
  _forge_kata_prepend_path "${PYTHONUSERBASE}/bin"
fi
export PATH

unset -f _forge_kata_append_path _forge_kata_prepend_path _forge_kata_append_pythonpath _forge_kata_prepend_library_path
