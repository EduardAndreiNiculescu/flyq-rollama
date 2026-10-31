# FlyQ 0.6B student — model handoff

The checked local student artifact is:

```text
finetune/out/06b/flightflow-0.6b-f16.gguf
bytes: 1,198,182,240
SHA-256: 3032bc55c6b9d6394326ec1416770cae30b1718144a491c8ed68149a87bd6c7e
```

It is intentionally ignored by Git. This is the distilled FlyQ student
used by the local `flightflow-0.6b` Ollama benchmark; it is not the public base
Qwen3-0.6B file.

For an iPhone build, copy it to `Documents/models/flightflow-0.6b-f16.gguf`.
The app deliberately does not download a public base model when the user selects
the `0.6B` tier: that would silently replace the benchmarked student with a
different model. Verify the SHA-256 before copying. The 0.6B build does not load
the V4 4B adapter.
