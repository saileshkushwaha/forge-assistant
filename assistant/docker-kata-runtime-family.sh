#!/usr/bin/env sh

forge_is_kata_family_runtime() {
  case "${FORGE_SANDBOX_RUNTIME:-}" in
    kata|firecracker|cloud-hypervisor)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}
