#!/usr/bin/env bash
# One-time setup of the Mac mini as an iOS build host. Safe to re-run. Run it ON the Mac.
set -u
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8  # non-interactive SSH has no Homebrew in PATH
ok() { echo "OK   $*"; }
todo() { echo "TODO $*"; MISSING=1; }
MISSING=0

[ "$(uname -s)" = Darwin ] && ok "macOS $(sw_vers -productVersion) on $(uname -m)" || { echo "not a Mac"; exit 1; }

if xcodebuild -version >/dev/null 2>&1; then ok "$(xcodebuild -version | tr '\n' ' ')"; else todo "install Xcode from the App Store, open it once"; fi
xcode-select -p >/dev/null 2>&1 && ok "command line tools: $(xcode-select -p)" || todo "run: xcode-select --install"
if xcodebuild -license check >/dev/null 2>&1; then ok "Xcode license accepted"; else todo "run: sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch"; fi

if ! command -v brew >/dev/null 2>&1; then todo 'install Homebrew: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'; else
  ok "brew $(brew --version | head -1)"
  command -v node >/dev/null 2>&1 || brew install node
  command -v pod >/dev/null 2>&1 || brew install cocoapods
  command -v git >/dev/null 2>&1 || brew install git
fi
command -v node >/dev/null 2>&1 && ok "node $(node -v)" || todo "node missing"
command -v pod  >/dev/null 2>&1 && ok "cocoapods $(pod --version)" || todo "cocoapods missing"

ok "SSH reachable (you are connected through it)"

echo
echo "Manual, once (needs the GUI): Xcode > Settings > Accounts > add the paid Apple ID; then plug in the iPhone, tap Trust,"
echo "Settings > Privacy & Security > Developer Mode ON (restart). Devices seen by Xcode:"
xcrun devicectl list devices 2>/dev/null || echo "(devicectl not available yet)"
[ "$MISSING" = 0 ] && echo "READY" || echo "NOT READY: fix the TODO lines and re-run"
