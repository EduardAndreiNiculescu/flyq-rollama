# Inspector local FlightFlow V4

Pe Windows, cu Ollama pornit și modelul `ff-adapter-v4:latest` instalat:

```powershell
npm ci
npm run inspect
```

Deschide `http://127.0.0.1:18090/ui`. Serverul ascultă numai pe `127.0.0.1`. Zborul `FF123` este fictiv; nu se folosește o cheie AirLabs și nu se consumă apeluri live. Alte numere de zbor nu există în acest mod. Oprești serverul cu Ctrl+C în terminalul în care l-ai pornit.

Pagina arată răspunsul, ruta fast/composed/model, apelurile de tool și rezultatele lor, timpii, promptul și mesajele din conversație. „Traseul răspunsului” este o explicație construită din pașii observabili. Qwen3 rulează cu thinking dezactivat; nu există un jurnal al raționamentului intern. Numărul de blocuri Transformer vine din metadatele GGUF oferite de Ollama; activările fiecărui layer nu sunt expuse.

Testul folosește modelul V4 din Ollama pe PC, contractul V4 și aceleași unelte ale aplicației, cu date de zbor fictive. Runtime-ul iPhone folosește `llama.rn`, deci latența și unele ieșiri pot diferi.
