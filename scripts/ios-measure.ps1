# iOS measurements on the phone, driven from the laptop. Everything it does is printed.
#   1. relaunch the app from the Mac with its console attached (llama.cpp prints its buffer sizes there)
#   2. baseline: KV cache f16 (what ships) -> buffer sizes, then 6 rules questions at 2048 context and 3 timing questions
#   3. KV cache q8_0 -> buffer sizes, the same 3 timing questions
#   4. new crash / panic / memory reports on the phone since the start
# Needs: the gateway on 18090 (token in %TEMP%\gw.token), the Mac on, the app installed, the phone unlocked.
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:GATEWAY_TOKEN = (Get-Content $env:TEMP\gw.token)
$mac = '<user>@<mac>.local'; $udid = '<UDID-iPhone>'; $bundle = 'com.flightflow.craiova.dev'
$t0 = Get-Date
function Say($s) { Write-Host ("[{0}] {1}" -f (Get-Date -Format HH:mm:ss), $s) -ForegroundColor Cyan }
function Dev { param([string[]]$a) & npx tsx scripts/device.ts @a 2>&1 }
function MacCmd($c) { ssh -o BatchMode=yes $mac "export PATH=/opt/homebrew/bin:/usr/local/bin:`$PATH; $c" 2>&1 }
function Sizes($label) {
  Say "buffers in the phone console ($label):"
  MacCmd "grep -iE 'llama_kv_cache|kv buffer|KV self|compute buffer|MTL0 model buffer|CPU model buffer|flash_attn|type_k|type_v' ~/ff-console.log | tail -14 | cut -c1-170" | ForEach-Object { Write-Host "   $_" }
}
function Pressure($label) {
  $w = (MacCmd "grep -c 'Memory warning' ~/ff-console.log; grep -c 'Terminating app' ~/ff-console.log") -join ' / '
  Say "memory warnings / app terminations in the console so far ($label): $w"
}
function WaitLink {
  for ($i = 0; $i -lt 24; $i++) { $s = (Dev @('status')) -join "`n"; if ($s -match '"connected": true') { return $true }; Start-Sleep 5 }
  return $false
}
function Ask($q) {
  $out = (Dev @('ask', $q, '--source', 'deviceTools')) -join ' | '
  Write-Host ("   Q: {0}`n   {1}" -f $q, $out.Substring(0, [Math]::Min(330, $out.Length)))
}

Say 'relaunching the app with the console attached'
MacCmd "pkill -f 'devicectl device process launch' 2>/dev/null; rm -f ~/ff-console.log; nohup xcrun devicectl device process launch --device $udid --terminate-existing --console $bundle > ~/ff-console.log 2>&1 &" | Out-Null
if (-not (WaitLink)) { Say 'the phone did not connect: open the app on Test mode and try again'; exit 1 }
Say 'connected'

Say 'BASELINE: KV cache f16, context 2048, adapter on'
Dev @('reload', '--adapter', 'on', '--nctx', '2048', '--kv', 'f16') | Select-String 'loaded|nCtx|kv|adapter' | ForEach-Object { Write-Host "   $($_.Line.Trim())" }
Sizes 'f16'

# The rules questions are not measured here: under today's (v3) prompt their second step is 2.1k tokens, more than the 2048 context (see docs/V4_DECISION.md); V4's is 1.2k.
Pressure 'f16 baseline, before any question'
Say 'TIMING f16: 3 questions'
foreach ($q in @('La ce poartă sunt?', 'Cât mai durează zborul?', 'Where is the plane right now?')) { Dev @('reset') | Out-Null; Ask $q }

Say 'EXPERIMENT: KV cache q8_0'
Dev @('reload', '--adapter', 'on', '--nctx', '2048', '--kv', 'q8_0') | Select-String 'loaded|nCtx|kv|adapter' | ForEach-Object { Write-Host "   $($_.Line.Trim())" }
Sizes 'q8_0'
Say 'TIMING q8_0: the same 3 questions'
foreach ($q in @('La ce poartă sunt?', 'Cât mai durează zborul?', 'Where is the plane right now?')) { Dev @('reset') | Out-Null; Ask $q }

Pressure 'after the q8_0 questions'
Say 'back to the shipping config (f16)'
Dev @('reload', '--adapter', 'on', '--nctx', '2048', '--kv', 'f16') | Out-Null

Say 'new crash, panic and memory reports on the phone since the start of this run:'
MacCmd "xcrun devicectl device info files --device $udid --domain-type systemCrashLogs 2>&1 | grep -E '10/30/26' | grep -iE 'FlightFlow|panic|Jetsam' | cut -c1-150" | ForEach-Object { Write-Host "   $_" }
Say ("done in {0:N0} s" -f ((Get-Date) - $t0).TotalSeconds)
Write-Host 'MEASUREMENTS DONE' -ForegroundColor Green
