# Prints one clean line every 20 s about the running training: step, speed, time left, last eval loss, GPU. Stop with Ctrl-C.
#   powershell -File scripts\watch-train.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
$log = 'finetune\out\train_v4.log'
while ($true) {
  # the training process keeps the file open for writing: read it with sharing allowed
  $fs = [IO.File]::Open((Resolve-Path $log).Path, 'Open', 'Read', 'ReadWrite')
  $t = (New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8)).ReadToEnd().Replace("`r", "`n")
  $fs.Close()
  $step = ([regex]::Matches($t, '(\d+)/511 \[([^\]]+)\]') | Select-Object -Last 1)
  $loss = ([regex]::Matches($t, "'eval_loss': '([0-9.]+)'[^}]*'epoch': '([0-9.]+)'") | Select-Object -Last 1)
  $tl = ([regex]::Matches($t, "'loss': '([0-9.]+)'") | Select-Object -Last 1)
  $gpu = (nvidia-smi --query-gpu=memory.used,utilization.gpu,temperature.gpu --format=csv,noheader)
  $done = $t -match 'END '
  $line = "{0}  pas {1}/511  {2}  | loss antrenare {3}  | eval_loss {4}  | GPU {5}" -f (Get-Date -Format HH:mm:ss), $(if ($step) { $step.Groups[1].Value } else { '?' }), $(if ($step) { $step.Groups[2].Value } else { '' }), $(if ($tl) { $tl.Groups[1].Value } else { '-' }), $(if ($loss) { $loss.Groups[1].Value } else { '-' }), $gpu
  Write-Host $line
  if ($done) { Write-Host 'ANTRENARE TERMINATA'; break }
  Start-Sleep 20
}
