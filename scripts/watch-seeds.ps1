# Live view of the 5-seed laptop benchmark (logs written by scripts/laptop-bench.ts into %TEMP%\seedNN.log). Ctrl-C to stop watching; the benchmark keeps running.
$dir = $env:TEMP
foreach ($s in 11, 12, 13, 14, 15) {
  $f = Join-Path $dir "seed$s.log"
  Write-Host "=== seed $s ===" -ForegroundColor Cyan
  while (-not (Test-Path $f)) { Start-Sleep -Seconds 2 }
  $done = $false
  $shown = 0
  while (-not $done) {
    $lines = @(Get-Content $f -Encoding UTF8)
    for ($i = $shown; $i -lt $lines.Count; $i++) {
      $l = $lines[$i]
      if ($l -match ' NU ') { Write-Host $l -ForegroundColor Red } elseif ($l -match ' ok ') { Write-Host $l -ForegroundColor Green } else { Write-Host $l }
      if ($l -match '^exit|=== rezumat ===') { $done = $true }
    }
    $shown = $lines.Count
    if (-not $done) { Start-Sleep -Milliseconds 800 }
  }
  Start-Sleep -Seconds 4
}
Write-Host "gata cele 5 seed-uri" -ForegroundColor Cyan
