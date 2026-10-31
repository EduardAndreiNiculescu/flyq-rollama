# Verifies the context guard on the phone: the six rules questions that overflowed the 2048 window (and once aborted the app), asked one by one with the conversation reset.
# A passing run = every question gets a real answer, no app termination, and no NEW crash or Jetsam report on the phone.
#   powershell -File scripts\ios-rules.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:GATEWAY_TOKEN = (Get-Content $env:TEMP\gw.token)
$mac = '<user>@<mac>.local'; $udid = '<UDID-iPhone>'; $bundle = 'com.flightflow.craiova.dev'
function Say($s) { Write-Host ("[{0}] {1}" -f (Get-Date -Format HH:mm:ss), $s) -ForegroundColor Cyan }
function Dev { param([string[]]$a) & npx tsx scripts/device.ts @a 2>&1 }
function MacCmd($c) { ssh -o BatchMode=yes $mac "export PATH=/opt/homebrew/bin:/usr/local/bin:`$PATH; $c" 2>&1 }
function Reports { (MacCmd "xcrun devicectl device info files --device $udid --domain-type systemCrashLogs 2>&1 | grep -iE 'FlyQ|FlightFlow|panic|Jetsam' | grep -oE '[A-Za-z]+-2026-10-[0-9-]+\.ips' | sort -u") }
$before = @(Reports)
Say ("reports on the phone before the run: {0}" -f $before.Count)

Say 'relaunching the app with the console attached'
MacCmd "pkill -f 'devicectl device process launch' 2>/dev/null; rm -f ~/ff-console.log; nohup xcrun devicectl device process launch --device $udid --terminate-existing --console $bundle > ~/ff-console.log 2>&1 &" | Out-Null
$ok = $false
for ($i = 0; $i -lt 24; $i++) { if (((Dev @('status')) -join "`n") -match '"connected": true') { $ok = $true; break }; Start-Sleep 5 }
if (-not $ok) { Say 'the phone did not connect'; exit 1 }
Dev @('load') | Select-String 'loaded|adapter|nCtx' | ForEach-Object { Write-Host "   $($_.Line.Trim())" }

$pass = 0; $fail = 0
foreach ($q in @('Am pierdut avionul, ce fac aucm?', 'Zborul meu a fost anula, ce drepturi am? ?!', 'mă pot lua un caine cu miine in avion?', 'pot lua apa prin securitate mă', 'Ce fac dacă zborul e întârziat 4 ore?', 'Cum merge un copil de 10 ani singur in avion')) {
  Dev @('reset') | Out-Null
  $out = (Dev @('ask', $q, '--source', 'deviceTools')) -join ' | '
  $bad = $out -match 'nu a putut porni|could not start|error'
  if ($bad) { $fail++ } else { $pass++ }
  Write-Host ("   {0} Q: {1}`n      {2}" -f $(if ($bad) { 'FAIL' } else { 'ok  ' }), $q, $out.Substring(0, [Math]::Min(300, $out.Length)))
}
Say ("answers: {0} ok, {1} failed" -f $pass, $fail)
$w = (MacCmd "grep -c 'Memory warning' ~/ff-console.log; grep -c 'Terminating app' ~/ff-console.log; grep -c 'terminated due to signal' ~/ff-console.log") -join ' / '
Say "memory warnings / fatal exceptions / signal exits in the console: $w"
$after = @(Reports)
$new = $after | Where-Object { $before -notcontains $_ }
Say ("NEW reports on the phone during this run: {0}" -f @($new).Count)
$new | ForEach-Object { Write-Host "   $_" }
Write-Host $(if ($fail -eq 0 -and @($new).Count -eq 0) { 'RULES TEST PASSED' } else { 'RULES TEST DID NOT PASS' }) -ForegroundColor $(if ($fail -eq 0 -and @($new).Count -eq 0) { 'Green' } else { 'Red' })
