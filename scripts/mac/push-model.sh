#!/usr/bin/env bash
# Copy a GGUF (base model or LoRA adapter) into the app's Documents/models on the iPhone, so the demo needs no Wi-Fi download.
#   scripts/mac/push-model.sh <device name or UDID> <file.gguf>
# Needs the app installed (development-signed) and Xcode 15+. The app expects models under Documents/models (see src/llm/modelProvision.ts).
set -eu
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8  # non-interactive SSH has no Homebrew in PATH
DEVICE="${1:?device}"; FILE="${2:?file}"
BUNDLE_ID=$(node -e 'console.log(require("./app.json").expo.ios.bundleIdentifier)')
xcrun devicectl device copy to --device "$DEVICE" --domain-type appDataContainer --domain-identifier "$BUNDLE_ID" \
  --source "$FILE" --destination "Documents/models/$(basename "$FILE")"
echo "copied $(basename "$FILE")"
