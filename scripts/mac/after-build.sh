#!/bin/bash
# Waits for the build on the Mac to finish, then builds the latest commit for the iPhone and then the iPad, and prints one summary.
# Usage: MAC_HOST=user@host IPHONE=<udid> IPAD=<udid> bash scripts/mac/after-build.sh
set -u
done_on_mac() { ssh -o BatchMode=yes -o ConnectTimeout=15 "$MAC_HOST" 'grep -q BUILD-FINISHED ~/build.log 2>/dev/null'; }
until done_on_mac; do sleep 60; done
MAC_DEVICE="$IPHONE" PUSH=1 node scripts/mac/remote.mjs build > /dev/null 2>&1
sleep 30
until done_on_mac; do sleep 60; done
echo "== iPhone =="
ssh -o BatchMode=yes "$MAC_HOST" 'grep -E "BUILD\+INSTALL DONE|BUILD FAILED|error:" ~/build.log | tail -4 | cut -c1-220'
ssh -o BatchMode=yes "$MAC_HOST" "cd ~/flightflow && PUSH=1 bash scripts/mac/build-ios.sh $IPAD 2>&1 | tee ~/build-ipad.log | tail -0; echo BUILD-FINISHED >> ~/build-ipad.log"
echo "== iPad =="
ssh -o BatchMode=yes "$MAC_HOST" 'grep -E "BUILD\+INSTALL DONE|BUILD FAILED|error:|provisioning|No profiles" ~/build-ipad.log | tail -5 | cut -c1-220'
