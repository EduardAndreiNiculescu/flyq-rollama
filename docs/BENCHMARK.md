# On-device benchmark report – iPhone 15

**No measurements have been taken yet.** Fill this in from a Release build on the physical device. Do not estimate.

Procedure: fresh launch, phone unplugged at known battery %, Airplane Mode, `n_ctx` 2048 first, then 1024/4096. Send 20 consecutive prompts (mix RO/EN, with and without flight context). Read TTFT and tok/s from the message bubble; peak memory via Xcode Instruments (Allocations/Memory gauge); thermal via `ProcessInfo.thermalState` or Instruments; note any jetsam kills.

| Metric | n_ctx 1024 | n_ctx 2048 | n_ctx 4096 |
|---|---|---|---|
| Model load time (s) | | | |
| Time to first token, median/p95 (ms) | | | |
| Generation speed (tok/s) | | | |
| Peak memory (MB) | | | |
| Crashes / memory-pressure kills in 20 runs | | | |
| Battery drop over 20 runs (%) | | | |
| Thermal state at end | | | |

Fallback if too slow/large: benchmark Qwen3-1.7B Q4_K_M and record why; never swap silently.
