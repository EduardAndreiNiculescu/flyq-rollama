# Test gateway (desktop only, not shipped)

A small HTTP server that lets the desktop model call the **same tools the app uses**, but against **live data** (AirLabs). Its purpose is to see how tool calling behaves with real APIs and to give the team a fixed contract to implement in the app.

```
npm run gateway     # needs AIRLABS_API_KEY in the environment; binds to 127.0.0.1:18090 only
```

Env: `AIRLABS_API_KEY` (required), `AIRLABS_MAX_CALLS` (default 25 upstream calls per process), `OLLAMA_URL` (default `http://127.0.0.1:11435`), `OLLAMA_MODEL` (default `ff-base`), `GATEWAY_PORT`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness + upstream call counters |
| GET | `/v1/tools` | the exact tool specs the model sees (the contract) |
| POST | `/v1/tools/{name}` | run one tool: `{"arguments": {...}, "flightNumber"?: "KL462"}` |
| POST | `/v1/chat` | run model + tool loop: `{"question": "...", "flightNumber"?: "..."}` |

Security: loopback only, browser `Origin` rejected, JSON only, 16 KB body cap, API key never logged or echoed (the provider's `request` echo is stripped).

## Tool contract (names and argument schemas are frozen; descriptions may be tuned)

| Tool | Arguments | Side effect | Use for |
|---|---|---|---|
| `get_flight_details` | `flightNumber?` | no | times, route, gate, provider status, **`delay_verdict`** |
| `get_gate` | `flightNumber?` | no | gate if confirmed |
| `get_time_remaining` | `flightNumber?` | no | time to departure/arrival |
| `get_live_tracking` | `flightNumber?` | no | last observed position + rough ETA |
| `search_knowledge` | `query` | no | rules and help (baggage, documents, security, rights, ...) |
| `open_airport_map` | `destination` | **yes** (opt-in) | open the map to a place |

Results are JSON: `{"result": ...}` or `{"error": "..."}`. Errors the model must handle: `flight not found by the data provider`, `flight data unavailable right now (<reason>)`, `no flight number given: ask the passenger for it`.

`delay_verdict` is computed by code from estimated vs scheduled times: `{verdict: early|on_time|delayed|unknown, minutes, basis}` (delayed at 15 min or more, early at 5 min or more). The model must never decide delay itself.

## Data rules learned from the live check

- AirLabs `speed` is km/h and `alt` is metres. Altitude is omitted on the ground, so a missing altitude is not "airborne".
- Arrival "local" times from the provider are unreliable: the app derives local times from UTC plus the airport IANA zone.
- A flight marked `landed` can carry the aircraft's stale position, so tracking returns `flight_completed` instead of a live position.
- Responses are cached for 60 s (errors too) and capped per process to protect the free quota. Terms forbid reselling raw data.
