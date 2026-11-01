#!/usr/bin/env bash
# Release build of FlyQ and install on the connected iPhone. Run ON the Mac, in a GUI Terminal session (signing needs the unlocked keychain).
#   scripts/mac/build-ios.sh <device UDID>
# Env: APPLE_TEAM_ID (default: read from the Apple Development certificate in the keychain)
set -eu
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8  # non-interactive SSH has no Homebrew in PATH
DEVICE="${1:?usage: build-ios.sh <device UDID>  (see: xcrun devicectl list devices)}"
cd "$(dirname "$0")/../.."

TEAM="${APPLE_TEAM_ID:-$(security find-certificate -c 'Apple Development' -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | sed -n 's#.*OU=\([A-Z0-9]*\).*#\1#p')}"
[ -n "$TEAM" ] || { echo "no Apple team id: set APPLE_TEAM_ID"; exit 3; }
echo "team $TEAM"

# llama.rn adds increased-memory-limit only when NODE_ENV (or EAS_BUILD_PROFILE) is production; prebuild resets NODE_ENV, so the profile variable is what the plugin really sees.
export NODE_ENV=production EAS_BUILD_PROFILE=production
# The FlyQ app key is baked into the build from the Mac, never from git: put `export EXPO_PUBLIC_FLYQ_KEY=...` in ~/.flyq-build-env on the Mac (once).
[ -f "$HOME/.flyq-build-env" ] && . "$HOME/.flyq-build-env" && echo "build env loaded (key length ${#EXPO_PUBLIC_FLYQ_KEY})"
npm ci
# Incremental by default (a clean prebuild recompiles React Native from source). CLEAN=1 forces it.
if [ "${CLEAN:-0}" = 1 ] || [ ! -d ios ]; then npx expo prebuild --platform ios --clean; else npx expo prebuild --platform ios; fi

# The app's own entitlements, not the widget extension's (ios/ExpoWidgetsTarget/*.entitlements has only the app group).
ENT=$(find ios -name '*.entitlements' -not -path '*/Pods/*' -not -path '*ExpoWidgetsTarget*' | head -1)
for key in com.apple.developer.kernel.increased-memory-limit com.apple.developer.kernel.extended-virtual-addressing; do
  grep -q "$key" "$ENT" || { echo "MISSING entitlement $key in $ENT: refusing to build without it"; exit 2; }
done
# expo-notifications adds aps-environment by itself (even without the config plugin). The signing profile must include Push Notifications for it;
# until the Apple account is in Xcode and the profile is regenerated, strip it. PUSH=1 keeps it.
if [ "${PUSH:-0}" != 1 ]; then /usr/libexec/PlistBuddy -c "Delete :aps-environment" "$ENT" 2>/dev/null && echo "push entitlement removed (PUSH=1 keeps it)"; fi
echo "entitlements OK ($ENT)"

# Not `expo run:ios`: its signing check (find-identity -v) rejects a certificate that xcodebuild signs with fine.
DD="$HOME/ff-derived"
( cd ios && xcodebuild -workspace FlyQ.xcworkspace -scheme FlyQ -configuration Release -destination "id=$DEVICE" -derivedDataPath "$DD" \
    -allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic build )
APP="$DD/Build/Products/Release-iphoneos/FlyQ.app"
BUNDLE_ID=$(node -e 'console.log(require("./app.json").expo.ios.bundleIdentifier)')
xcrun devicectl device install app --device "$DEVICE" "$APP"
xcrun devicectl device process launch --device "$DEVICE" "$BUNDLE_ID" || echo "installed; open the app on the phone (it may need Settings > General > VPN & Device Management > trust)"
echo "BUILD+INSTALL DONE"
