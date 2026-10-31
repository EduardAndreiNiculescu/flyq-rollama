param([int]$IntervalSeconds = 5, [switch]$Once)
$ErrorActionPreference = 'Stop'
$CodexRoot = Split-Path $PSScriptRoot -Parent
$WorkRoot = Split-Path $CodexRoot -Parent
$GeminiRoot = Join-Path $WorkRoot 'flightflow-gemini'
$UnifiedDir = Join-Path $CodexRoot 'finetune\out\06b'
New-Item -ItemType Directory -Force $UnifiedDir | Out-Null
$UnifiedLog = Join-Path $UnifiedDir 'monitor.log'

function Read-LabStatus([string]$Root, [string]$Actor) {
  $path = Join-Path $Root 'finetune\out\06b\status.json'
  if (!(Test-Path $path)) { return [pscustomobject]@{ actor=$Actor; stage='waiting'; state='pending'; message='fara status'; metrics=$null } }
  try { return Get-Content $path -Raw | ConvertFrom-Json } catch { return [pscustomobject]@{ actor=$Actor; stage='status'; state='failed'; message=$_.Exception.Message; metrics=$null } }
}

function Format-LabStatus($Status) {
  $progress = if ($null -ne $Status.current -and $null -ne $Status.total) { " $($Status.current)/$($Status.total)" } else { '' }
  $metrics = if ($Status.metrics) { ($Status.metrics.psobject.Properties | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ' ' } else { '' }
  return ('{0,-7} {1,-18} {2,-8}{3} {4} {5}' -f $Status.actor.ToString().ToUpperInvariant(), $Status.stage, $Status.state, $progress, $metrics, $Status.message).TrimEnd()
}

do {
  $codex = Read-LabStatus $CodexRoot 'codex'
  $gemini = Read-LabStatus $GeminiRoot 'gemini'
  $gpu = try { nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits } catch { 'indisponibil' }
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $lines = @("[$stamp]", (Format-LabStatus $codex), (Format-LabStatus $gemini), "GPU     $gpu")
  Clear-Host
  $lines | ForEach-Object { Write-Host $_ }
  Add-Content -Path $UnifiedLog -Value ($lines -join ' | ')
  if (!$Once) { Start-Sleep -Seconds ([Math]::Max(1, $IntervalSeconds)) }
} while (!$Once)
