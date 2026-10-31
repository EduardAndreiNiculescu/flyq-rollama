# Modele (nu sunt în git)

| Model | Fișier | Sursă | Mărime | sha256 | Stare |
|---|---|---|---|---|---|
| RoLlama 3.2 1B + DPO + SFT auxiliar, Q4 | `rollama-1b-dpo-q4.gguf` | local: `flightflow-codex/finetune/out/rollama/` | ~812 MB | de calculat | NEVERIFICAT pe iPhone |

Reguli: GGUF-ul nu e acceptat pentru iPhone până nu se verifică headerul, încărcarea în llama.rn și contractul de unelte.
Safetensors INT4 nu este Core ML și nu este compatibil ANE de la sine.
