; Custom NSIS macro: override the default install directory so it lands
; in a path NOT under %LOCALAPPDATA% (which on Claude Code installs has
; the Anthropic Codex Sandbox AppContainer ACL that kills the renderer
; process at startup). We pick $PROFILE (= %USERPROFILE%) so the app
; stays per-user (no UAC) but outside the sandboxed AppData tree.
;
; electron-builder's .onInit reads InstallLocation from the registry to
; seed $INSTDIR, so writing it here in preInit takes effect before the
; install directory is finalized.

!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROFILE\Beta Trading Hub"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROFILE\Beta Trading Hub"
  SetRegView 32
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROFILE\Beta Trading Hub"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROFILE\Beta Trading Hub"
!macroend
