# FLIGHTFLOW — OFFLINE RAG CORPUS SPECIFICATION & BENCHMARK REPORT
## Version: 1.0.0 (Offline Aviation Knowledge Base)
**Status:** CANDIDAT — REVIEW REQUIRED  
**Primary Engine:** Lexical BM25 / In-Memory IDF Prefix Match (Migratable to SQLite FTS5)  
**Target Architecture:** iPhone On-Device Local Assistant (React Native / iOS)

Corpusul este generat și versionat, dar nu este încă acceptat pentru producție.
Evaluarea curentă trece recall-ul și citările, însă eșuează porțile de siguranță
pentru refuzuri și jurisdicție. Integrarea finală este permisă doar când
`finetune/rag/report.json` are `status: "PASSED"`.

---

## 1. EXECUTIVE SUMMARY & ARTIFACTS

This corpus establishes an offline, bilingual (Romanian & English), strictly verified factual repository for FlightFlow. It delivers passenger rights, airport security mandates, baggage rules, medical clearances, accessibility requirements, customs limitations, and emergency protocols directly onto passenger devices without cloud dependencies.

### Deliverables Manifest
- **Canonical Corpus:** `finetune/rag/corpus.jsonl` (84 chunks, 42 concepts, 230,713 bytes, UTF-8)
- **Authority Sources Catalog:** `finetune/rag/sources.json` (12 verified official authorities, 6 rejected SEO/scraped sources)
- **Data Splits (Zero-Leakage):**
  - Train: `finetune/rag/splits/train.jsonl` (60 chunks, 30 concepts / 71.4%)
  - Validation: `finetune/rag/splits/val.jsonl` (12 chunks, 6 concepts / 14.3%)
  - Held-out Test: `finetune/rag/splits/test.jsonl` (12 chunks, 6 concepts / 14.3%)
- **Evaluation Benchmark:** `finetune/rag/benchmark.jsonl` (380 test cases across 6 distinct categories)
- **Audit & Benchmark Report:** `finetune/rag/report.json`
- **Telemetry & Status:** `finetune/out/rag/status.json` and `finetune/out/rag/events.jsonl`

---

## 2. OFFICIAL PRIMARY AUTHORITIES & INTEGRITY AUDIT

Every factual claim in the corpus originates exclusively from official statutory authorities, national border agencies, civil aviation directorates, or international treaties. Unofficial secondary aggregators, blogs, and AI-generated summaries were audited and categorically rejected.

### 2.1 Verified Official Authorities (12 Primary Sources)

| Source Identifier | Institution / Publisher | Canonical Instrument / URL | Scope & Legal Jurisdiction | Verification Hash (SHA-256) |
|---|---|---|---|---|
| `EURLEX_261_2004` | European Parliament & Council | [Regulation (EC) No 261/2004](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32004R0261) | EU Air Passenger Rights (Delay, Cancellation, Overbooking) | `f5979bb87a602cff8a4fe64bb8aa15ee8000aa647e3a9fa93297f0ba8763fe74` |
| `EURLEX_1107_2006` | European Parliament & Council | [Regulation (EC) No 1107/2006](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006R1107) | Rights of Disabled Persons & PRM Passengers | `3ba928a46757b54a01c40b8529206d2a70cb65e25ee3d1222c1db45ea45e9a4f` |
| `EURLEX_AVSEC_2015_1998` | European Commission | [Commission Reg (EU) 2015/1998](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015R1998) | Common Aviation Security Standards (Liquids, Weapons, STEB) | `79c85faad2fa627341e97ee9cfd6f1bfd8434606138676d47b0a708eb19aa535` |
| `MONTREAL_CONVENTION_1999` | ICAO / United Nations | [Montreal Convention 1999](https://www.icao.int/secretariat/legal/list%20of%20parties/montreal_1999_en.pdf) | International Air Carrier Liability (Baggage 1,288 SDR) | `86ca1b333a90aa829ffae156bca9da297b87c71d236021f18fb52eb71bb35a82` |
| `YOUR_EUROPE_AIR_RIGHTS` | European Commission | [Your Europe Passenger Portal](https://europa.eu/youreurope/citizens/travel/passenger-rights/air/) | Practical EU Passenger Rights Guidance | `8b09a1a2b972c3d52c2ee0662d04a6e35cb40c7e2bda3f39561b3fe9f425f1be` |
| `POLITIA_FRONTIERA_SCHENGEN` | Poliția de Frontieră Română | [Air Schengen Rules](https://www.politiadefrontiera.ro/ro/main/i-intrebari-frecvente-privind-intrarea-romaniei-in-spatiul-schengen-pe-cale-aeriana-si-maritima-368.html) | Border Clearance & Air Schengen Verification | `895ba3158c35b5a452178e69736fca93d67f50a498066601b38f8cfc3e80c4e0` |
| `POLITIA_FRONTIERA_MINORI` | Poliția de Frontieră Română | [Minor Travel Conditions](https://www.politiadefrontiera.ro/ro/main/i-conditii-de-calatorie-pentru-cetatenii-romani-minori-369.html) | Romanian Minors Border Clearance (Law 248/2005) | `c51fc898fc66b2a3dfa6401614f1ca62e783457aeece19c6fef464d262d184cf` |
| `EASA_LITHIUM_BATTERIES` | European Union Aviation Safety Agency | [EASA Dangerous Goods Guidance](https://www.easa.europa.eu/en/domains/passengers/dangerous-goods) | Lithium Battery & Powerbank Limits (100 Wh / 160 Wh) | `50ecba6297380962fc6201a09d3b1945a0b4d451ceb768e7ec89f216dc7b3707` |
| `EURLEX_PETS_576_2013` | European Parliament & Council | [Regulation (EU) No 576/2013](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0576) | Non-commercial Movement of Pet Animals | `b18c6ea3c09e51e9bca9a2bfbbfa5caec3aa10fa749e7b231ff6f8976b9f4460` |
| `AEROPORT_CRAIOVA_SECURITY` | Aeroportul Internațional Craiova | [Craiova Airport Security Regulations](https://aeroportcraiova.ro/controlul-de-securitate/) | Local Checkpoint Timelines, Parking & Infrastructure | `f5cf212dbdff453673f40f252bf445eeffab0c6b12a02ebefcf79be5dbbdf38f` |
| `MAE_ROMANIA_DOCUMENTE` | Ministerul Afacerilor Externe | [Travel Documents Conditions](https://www.mae.ro/node/1414) | Travel Document Authenticity & Consular Protocols | `f409549f3900350d322bca6a19f2095f9226cb12ee499d65013098670eb46e6a` |
| `EU_EMERGENCY_112` | European Commission | [Single European Emergency Number](https://digital-strategy.ec.europa.eu/en/policies/112) | Pan-European Emergency Assistance 112 | `3c85a850117ffbe478e630800fafe12b87e221375b477b79ebdbff53eb26e409` |

### 2.2 Explicitly Rejected Sources (Audit Blacklist)

| Rejected Entity | Category | Reason for Rejection |
|---|---|---|
| The Points Guy (TPG) | Commercial Travel Blog | Affiliate marketing incentives, frequent US/EU regulatory conflation, no statutory standing. |
| AirHelp / ClaimCompass | Commercial Claim Agency | Biased commercial interest, 35-50% commission push, oversimplified legal caveats. |
| Reddit (`r/travel`, `r/flights`) | Unverified User Forum | Anecdotal travel experiences, out-of-date border advice, zero factual verification. |
| TripAdvisor Forums | User Travel Forum | Subjective feedback, frequent confusion between airline policy and statutory rights. |
| Aviation File / SEO Portals | Content Farming Farm | High hallucination frequency, automated translation artifacts, lack of citation pedigree. |
| Border Guide 2021 (Various) | Obsolete Travel Blog | Pre-Air Schengen data (March 2024); claims routine border checks for EU intra-flights. |

---

## 3. CORPUS ARCHITECTURE & TAXONOMY

The corpus spans **42 distinct core concepts**, materialized symmetrically into **84 bilingual chunks** (42 Romanian, 42 English).

### 3.1 Domain Breakdown

1. **`security`** (4 concepts / 8 chunks): 100ml liquid limits, baby food exceptions, duty-free STEB bags, prohibited sharp items.
2. **`baggage`** (5 concepts / 10 chunks): Powerbanks carry-on mandate, Watt-hour limits (100/160 Wh), lost luggage PIR report, 7-day damage notice, 21-day delay claim (1,288 SDR).
3. **`rights`** (6 concepts / 12 chunks): Cancellation options (refund vs re-routing), compensation brackets (€250 / €400 / €600), Sturgeon 3h arrival delay rule, right to care (meals/hotel), 5h delay abandonment refund, denied boarding overbooking protections.
4. **`accessibility`** (3 concepts / 6 chunks): PRM 48h advance notice, mobility equipment free allowance (up to 2 items), assistance dogs cabin carriage.
5. **`pets`** (3 concepts / 6 chunks): Pet passport & microchip, rabies 21-day wait, airline cabin/hold carrier weight constraints.
6. **`children`** (3 concepts / 6 chunks): Romanian minors traveling with both parents, traveling with one parent (notarized consent), unaccompanied minors airline escort.
7. **`documents`** (3 concepts / 6 chunks): Valid passport vs ID card, digital scans/photos strictly rejected at border, lost documents consular protocols.
8. **`medical`** (3 concepts / 6 chunks): Liquid medications & syringes without 100ml limit, portable medical devices (CPAP/POC), flying pregnant week limits (28/36 weeks).
9. **`boarding`** (3 concepts / 6 chunks): Check-in and bag drop deadlines, gate closure (15-20 min before departure), missed flight rebooking protocols.
10. **`border`** (3 concepts / 6 chunks): Air Schengen March 2024 rules, random border police checks, customs €10,000 cash declaration threshold.
11. **`airport_specific`** (3 concepts / 6 chunks): Craiova arrival buffer (2 hours), Craiova Kiss & Ride / parking rates, Craiova terminal accessibility.
12. **`emergency`** (3 concepts / 6 chunks): Airport medical emergencies & 112, airport AED defibrillator locations, fire / evacuation security protocols.

### 3.2 Chunk Sizing & Structure Integrity

- **Target Word Range:** 80 – 220 words per chunk.
- **Observed Metrics:**
  - Minimum Chunk Size: 114 words
  - Maximum Chunk Size: 153 words
  - Average Chunk Size: 130.8 words
  - Standard Deviation: 8.4 words
- **Bilingual Symmetry:** Exactly 42 Romanian chunks paired semantically with 42 English chunks.
- **Citation Density:** 100% of numeric claims (compensation amounts, millimeter/gram thresholds, day limits) possess verified structural citations pointing to exact statutory articles.

---

## 4. SPLITTING METHODOLOGY & LEAKAGE VERIFICATION

To prevent data leakage between evaluation and training sets, the corpus is split using **Cluster-Based Source + Topic Isolation**:

- All chunks derived from a specific legal section or concept exist **strictly** in one split.
- **Splits:**
  - `train.jsonl`: 60 chunks / 30 concepts (71.4%)
  - `val.jsonl`: 12 chunks / 6 concepts (14.3%)
  - `test.jsonl`: 12 chunks / 6 concepts (14.3%)
- **Leakage Auditing:**
  - Direct ID Leakage: **0 chunks (0.0%)**
  - Cross-split Concept Leakage: **0 concepts (0.0%)**
  - 4-gram Jaccard Similarity Threshold: Max allowed 0.40. **Observed maximum: 0.223**.

---

## 5. BENCHMARK RESULTS & RETRIEVAL EVALUATION

The benchmark consists of **380 test cases** executed against the in-memory lexical retrieval engine modeled after `src/core/knowledge.ts`.

### 5.1 Benchmark Performance Summary

| Metric | Target | PC Benchmark Result | iPhone Physical Device |
|---|---|---|---|
| **Recall@1 (Answerable)** | $\ge 80.0\%$ | **86.00%** (258 / 300) | `nemăsurată` |
| **Recall@3 (Answerable)** | $\ge 95.0\%$ | **96.67%** (290 / 300) | `nemăsurată` |
| **Recall@5 (Answerable)** | $\ge 97.0\%$ | **98.67%** (296 / 300) | `nemăsurată` |
| **MRR (Mean Reciprocal Rank)** | $\ge 0.88$ | **0.9143** | `nemăsurată` |
| **Refusal Rate (Pure Unanswerable)** | Baseline | 6.67% (Raw BM25 `MIN_SCORE=3.0`) | `nemăsurată` |
| **Citation Integrity** | 100.0% | **100.0%** (0 citation errors) | N/A |
| **Median Retrieval Latency** | $< 100$ ms | **44.91 ms** (AMD Ryzen AI 9 HX 370) | `nemăsurată` |
| **Mean Retrieval Latency** | — | **50.96 ms** | `nemăsurată` |
| **P95 Retrieval Latency** | $< 150$ ms | **104.48 ms** | `nemăsurată` |

> [!IMPORTANT]
> Physical iPhone latency is marked strictly as **`nemăsurată`**. No synthetic or simulated iPhone execution timings are invented. Physical device profiling must occur via Instruments on physical Apple Silicon hardware.

### 5.2 Category Breakdown (380 Queries)

| Category | Total Queries | Recall@1 | Recall@3 | Recall@5 | MRR | Behavior / Notes |
|---|---|---|---|---|---|---|
| `ro_standard` | 150 | 86.67% | 96.67% | 98.00% | 0.9144 | Clean Romanian queries with standard syntax |
| `en_standard` | 100 | 84.00% | 95.00% | 99.00% | 0.9028 | Clean English queries |
| `no_diacritics_typo` | 50 | 88.00% | 100.00% | 100.00% | 0.9367 | Queries without Romanian diacritics & spelling typos |
| `unanswerable` | 30 | N/A | N/A | N/A | N/A | Out-of-scope non-aviation queries (cooking, crypto, etc.) |
| `ambiguous_jurisdiction` | 30 | N/A | N/A | N/A | N/A | Non-EU aviation queries (US TSA, UK domestic, Australia) |
| `prompt_injection` | 20 | N/A | N/A | N/A | N/A | Adversarial jailbreak & prompt exfiltration attempts |

### 5.3 Lexical Retrieval Findings on Adversarial & Out-of-Scope Queries

1. **Jurisdiction Mismatch:** Pure lexical search engines match keywords regardless of jurisdiction. When a user asks: *"Can I carry a full-size shampoo bottle under US TSA 3-1-1 domestic rules?"*, a keyword index matches "shampoo" and "bottle" to EU liquid regulations. In FlightFlow, this demonstrates why **Level 2 Intent Classification** and **Grounding Guard (`guardAnswer.ts`)** are critical upstream and downstream of the RAG retriever.
2. **Confidence Score Separation:** Answerable queries exhibit a median retrieval score of **19.5** (ranging from 12.0 to 48.0). Incidental token matches on out-of-scope queries produce scores between **3.0 and 7.5**. Introducing a confidence gating threshold of **8.0** filters out over 80% of out-of-scope lexical false positives while maintaining 95%+ Recall@3.

---

## 6. ON-DEVICE iOS / REACT NATIVE INTEGRATION GUIDE

### 6.1 Database Engine Recommendation: SQLite with FTS5

For offline execution on iOS within React Native:
- **Recommended Engine:** `op-sqlite` or `react-native-quick-sqlite` using **SQLite FTS5 (Full-Text Search 5)**.
- **Why NOT LanceDB directly in React Native?**
  - LanceDB's native Rust/C++ engine lacks mature, battle-tested React Native bindings for iOS ARM64.
  - Adding heavy C++ vector engines introduces substantial IPA binary bloat ($> 35$ MB) and complex bridging overhead.
  - SQLite FTS5 is natively supported by iOS `libsqlite3.dylib`, requires **zero extra native binary dependencies**, and delivers sub-1ms BM25 queries over an 84-chunk corpus.

### 6.2 SQLite FTS5 Schema

```sql
-- Create Virtual FTS5 Table for Offline Knowledge Retrieval
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
    id UNINDEXED,
    concept_id UNINDEXED,
    topic UNINDEXED,
    lang UNINDEXED,
    title,
    body,
    keywords,
    jurisdiction UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
);

-- Query with BM25 Ranking and Language Filtering
SELECT id, title, body, bm25(knowledge_fts, 5.0, 1.0, 8.0) AS score
FROM knowledge_fts
WHERE knowledge_fts MATCH :search_query
  AND lang = :user_lang
ORDER BY score ASC
LIMIT 3;
```

### 6.3 Semantic Vector Search Alternative (Hybrid)

If semantic embeddings are integrated in a future release:
- Precompute embeddings offline using an ultra-compact encoder (e.g., `all-MiniLM-L6-v2` or `bge-small-en-v1.5` quantized to INT8, $< 15$ MB).
- Store 84 embedding vectors (84 x 384 x 4 bytes = 129 KB) in a flat binary file bundled in the iOS app assets.
- Compute cosine similarity in pure JavaScript/C++ using SIMD accelerate framework (`vDSP_dotpr` in iOS Accelerate) in under $0.2$ ms for all 84 vectors.

---

## 7. MAINTENANCE & EXTENSION PROTOCOL

1. **Updating Regulations:**
   - Any modification to statutory regulations must update `finetune/rag/sources.json` with the updated verification timestamp and legal citation.
   - Re-run `python finetune/rag/builder.py` to regenerate `corpus.jsonl`.
2. **Re-verifying Zero Leakage:**
   - Execute `python finetune/rag/splitter.py` to repartition splits and verify the 4-gram Jaccard metric.
3. **Continuous Benchmarking:**
   - Execute `python finetune/rag/evaluator.py` to assert that Recall@3 remains $\ge 95\%$ and that zero citation errors are introduced.
