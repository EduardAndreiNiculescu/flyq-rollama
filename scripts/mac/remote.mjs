// Laptop side: push the code to the Mac and run a script there over SSH.
// The Mac repo is only a build mirror: the branch being built replaces main there (a plain push was rejected after another branch had been built, and the old code was built silently).
//   MAC_HOST=user@macmini.local MAC_DIR='~/flightflow' MAC_DEVICE=<UDID> node scripts/mac/remote.mjs build|bootstrap|model <file>
// `build` runs inside Terminal.app on the Mac (the logged-in GUI session, where the signing keychain is unlocked) and follows its log from here.
import { spawnSync } from 'node:child_process';
const [cmd, arg] = process.argv.slice(2);
const host = process.env.MAC_HOST, dir = process.env.MAC_DIR ?? '~/flightflow', device = process.env.MAC_DEVICE;
if (!host) { console.error('set MAC_HOST, e.g. <user>@<mac>.local'); process.exit(1); }
const run = (c, a, o = {}) => { const r = spawnSync(c, a, { stdio: 'inherit', ...o }); if (r.status !== 0) process.exit(r.status ?? 1); };
const ssh = (remote) => run('ssh', [host, `cd ${dir} && ${remote}`]);
const sshOut = (remote) => spawnSync('ssh', [host, remote], { encoding: 'utf8' }).stdout ?? '';
const sync = 'git fetch -q origin && git reset -q --hard origin/main';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (cmd === 'bootstrap') { run('git', ['push', '--force', 'mac', 'HEAD:main']); ssh(`${sync} && bash scripts/mac/bootstrap.sh`); }
else if (cmd === 'build') {
  if (!device) { console.error('set MAC_DEVICE to the iPhone UDID'); process.exit(1); }
  run('git', ['push', '--force', 'mac', 'HEAD:main']);
  ssh(`${sync} && rm -f ~/build.log && printf '#!/bin/bash\ncd ${dir} && PUSH=${process.env.PUSH ?? 0} bash scripts/mac/build-ios.sh ${device} 2>&1 | tee ~/build.log\necho BUILD-FINISHED >> ~/build.log\n' > ~/ff-build.command && chmod +x ~/ff-build.command && open -a Terminal ~/ff-build.command`);
  let seen = 0;
  for (;;) {
    await sleep(10_000);
    const lines = sshOut('cat ~/build.log 2>/dev/null').split('\n');
    const fresh = lines.slice(seen, -1);
    if (fresh.length) process.stdout.write(fresh.map((l) => l.slice(0, 220)).join('\n') + '\n');
    seen = Math.max(seen, lines.length - 1);
    if (lines.some((l) => l.includes('BUILD-FINISHED'))) process.exit(lines.some((l) => l.includes('BUILD+INSTALL DONE')) ? 0 : 1);
  }
}
else if (cmd === 'model' && arg) ssh(`bash scripts/mac/push-model.sh '${device}' '${arg}'`);
else { console.error('usage: remote.mjs bootstrap | build | model <file-on-the-mac>'); process.exit(1); }
