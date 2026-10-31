"""Build the isolated Tier-2 v2 training corpus.

The Romanian stress benchmark is read only: no benchmark text is copied into this corpus.
Generated samples are family-split before augmentation and rejected when too similar to
the frozen benchmark, validation, or legacy test sets.
"""
from __future__ import annotations

import json
import random
import re
import shutil
import argparse
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEGACY = ROOT / "finetune" / "intent_classifier" / "data"
OUT = ROOT / "finetune" / "intent_classifier" / "data_v2"
STRESS = ROOT / "eval" / "ro-human-stress-500.json"
LABELS = ("none", "clarify", "get_time_remaining", "get_live_tracking", "get_gate", "get_flight_details", "search_knowledge", "open_airport_map")
TRAIN_TARGET = {"none": 1200, "clarify": 800, "get_time_remaining": 800, "get_live_tracking": 800, "get_gate": 700, "get_flight_details": 700, "search_knowledge": 600, "open_airport_map": 400}
VAL_TARGET = {label: max(80, amount // 5) for label, amount in TRAIN_TARGET.items()}

BASES: dict[str, list[str]] = {
    "none": [
        "îmi rezervi o cameră lângă aeroport", "poți să-mi cumperi biletul", "vreau să schimb locul la avion",
        "care e vremea în Barcelona weekendul viitor", "fă-mi check-in pe site", "spune-mi o glumă",
        "cât costă un Uber până acasă", "cumpără-mi o cafea", "anulează-mi rezervarea",
        "găsește-mi un restaurant bun în oraș", "ce a făcut echipa națională", "scrie-mi un mesaj pentru șef",
        "care e cursul euro azi", "pune-mi un reminder pentru mâine", "vreau să închiriez o mașină",
        "spune-mi ce telefon să cumpăr", "care e parola Wi-Fi", "fă-mi upgrade la business",
        "poți să-mi alegi un hotel", "cine a câștigat alegerile",
    ],
    "clarify": [
        "ajută-mă cu asta", "și acum ce fac", "care e faza", "poți verifica pentru mine",
        "unde trebuie să mă duc", "nu înțeleg ce urmează", "cum stăm", "ce se întâmplă",
        "spune-mi ce trebuie să fac", "am o problemă", "unde e chestia", "mai am ceva de făcut",
        "ce îmi recomanzi", "nu găsesc nimic", "poți să mă lămurești", "e totul în regulă",
        "ce trebuie să știu", "mă poți ghida", "care e următorul pas", "nu mă descurc",
    ],
    "get_time_remaining": [
        "cât mai e până la decolare", "mai am timp să ajung la avion", "în câte minute începe boardingul",
        "cât mai pot sta aici", "mai prind cursa dacă plec acum", "când trebuie să fiu la poartă",
        "cât a rămas până plecăm", "mai am timp de control", "în cât timp se închide îmbarcarea",
        "câte ore mai sunt până la zbor", "mai e mult până urcăm în avion", "cât timp mai am",
        "în cât timp ajungem la boarding", "mai pot lua o cafea", "când începe îmbarcarea",
        "e prea târziu dacă sunt la securitate", "cât mai am de așteptat până la cursă",
        "mai am șanse să prind zborul", "când plecăm exact", "câte minute mai sunt",
    ],
    "get_live_tracking": [
        "unde se află avionul acum", "poți vedea aeronava pe radar", "care este poziția cursei",
        "avionul este încă în aer", "pe unde zboară acum", "arată-mi urmărirea live",
        "unde a ajuns avionul", "pot localiza zborul", "în ce zonă este aeronava",
        "avionul se apropie de aeroport", "ce traseu are cursa acum", "unde e avionul meu",
        "a aterizat aeronava", "care sunt coordonatele avionului", "avionul a trecut de graniță",
        "mai este departe avionul", "unde e cursa RO311", "arată-mi poziția în timp real",
        "ce viteză are avionul", "aeronava a decolat deja",
    ],
    "get_gate": [
        "care este poarta de plecare", "de la ce gate plec", "unde este îmbarcarea mea",
        "s-a anunțat poarta", "care e numărul porții", "poarta s-a schimbat",
        "unde aștept pentru zbor", "ce poartă am pentru cursă", "verifică-mi gate-ul",
        "unde urc în avion", "poarta de pe boarding pass mai este corectă", "care e noua poartă",
        "de unde pleacă RO311", "unde se face boardingul", "s-a mutat îmbarcarea",
        "ce gate este afișat", "poarta a fost actualizată", "la ce poartă trebuie să ajung",
        "unde este gate-ul meu", "care poartă îmi revine",
    ],
    "get_flight_details": [
        "zborul este la timp", "care este ora de plecare", "avem întârziere",
        "când aterizează cursa", "s-a anulat zborul", "care e statusul avionului",
        "a plecat deja aeronava", "care este ora estimată de sosire", "s-a schimbat programul",
        "care e întârzierea actuală", "zborul mai pleacă azi", "când decolăm",
        "care e ora din bilet", "cursa a ajuns", "care este ETA",
        "la ce oră aterizăm", "status pentru RO311", "zborul a fost deviat",
        "când ajunge avionul", "care este situația cursei",
    ],
    "search_knowledge": [
        "pot lua o baterie externă în cabină", "câte lichide am voie în bagajul de mână",
        "am voie cu medicamente în avion", "ce dimensiune poate avea bagajul de cabină",
        "pot transporta parfum", "ce fac dacă îmi pierd bagajul", "pot zbura cu animalul",
        "am dreptul la compensație pentru întârziere", "pot lua laptopul în rucsac",
        "sunt permise țigările electronice", "ce obiecte sunt interzise la control",
        "pot lua mâncare în avion", "ce acte trebuie pentru copil", "pot lua alcool în bagaj",
        "cum transport căruciorul copilului", "pot călători însărcinată", "ce fac la bagaj deteriorat",
        "pot avea pastile în bagaj", "care sunt regulile pentru powerbank", "pot trece cu apă prin securitate",
    ],
    "open_airport_map": [
        "unde este toaleta", "cum ajung la controlul de securitate", "unde găsesc bancomatul",
        "arată-mi terminalul doi", "unde e biroul de informații", "găsește-mi o cafenea",
        "unde este zona de fumat", "cum ajung la bagaje", "unde e lounge-ul",
        "arată-mi drumul către poarta B12", "unde este farmacia", "unde pot încărca telefonul",
        "cum ajung la check-in", "unde găsesc un restaurant", "unde e ieșirea spre taxi",
        "arată-mi harta terminalului", "unde este punctul de întâlnire", "unde găsesc duty free",
        "cum ajung la transferuri", "unde e liftul",
    ],
}

# Airport-adjacent requests that FlightFlow deliberately does not execute, plus
# genuinely ambiguous requests.  These are separate semantic families from the
# frozen stress suite and are screened by the same n-gram leakage guard below.
REJECTION_BOOST: dict[str, list[str]] = {
    "none": [
        "fă check-in pentru mine", "rezervă-mi un taxi la terminal", "spune-mi parola de internet",
        "comandă un sandwich la poartă", "mută-mi locul în avion", "cumpără un bilet spre Roma",
        "anulează cursa mea", "modifică numele de pe rezervare", "cere un upgrade la business",
        "alege-mi un hotel pentru diseară", "plătește-mi bagajul extra", "sună compania aeriană",
        "fă-mi rost de lounge gratis", "trimite emailul către companie", "verifică-mi pașaportul",
        "arată-mi prețul unui Bolt", "găsește-mi un loc de parcare", "spune-mi prognoza din Milano",
        "scrie o reclamație pentru mine", "rezervă o masă în oraș", "activează roamingul",
        "recomandă-mi un serial", "cât e bitcoin acum", "pune o alarmă la șase",
        "vorbește cu agentul de handling", "închiriază o mașină de la aeroport",
    ],
    "clarify": [
        "am nevoie de ajutor", "nu știu unde merg", "ce trebuie să fac acum",
        "verifică asta pentru mine", "e bine ce fac", "cum procedez de aici",
        "am pierdut firul", "care este situația", "mă poți orienta",
        "nu înțeleg mesajul primit", "unde ar trebui să fiu", "ce urmează pentru mine",
        "am o nelămurire", "ce înseamnă asta", "poți explica mai simplu",
        "nu găsesc ce caut", "e ceva în neregulă", "mă ajuți puțin",
        "vreau informații", "ce fac cu asta", "încotro trebuie să plec",
        "sunt blocat aici", "spune-mi pe scurt", "ce aleg acum",
        "nu știu ce opțiune am", "poți să verifici", "am nevoie de ghidaj",
    ],
}

PREFIXES = ["", "te rog, ", "salut, ", "scuze, ", "hei, ", "auzi, ", "urgent, ", "boss, ", "frate, ", "bă, "]
SUFFIXES = ["", " te rog", " repede", " că mă grăbesc", " pls", " mersi", " că nu văd nicăieri", " pentru azi", " acum", " vă rog"]
CONTEXTS = ["", " pentru zborul de azi", " la Otopeni", " am boarding pass-ul la mine", " sunt deja în terminal", " am cursa RO311", " sunt cu copilul", " nu am aplicația companiei", " sunt aproape de securitate", " sunt la poartă"]

def normalize(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9ăâîșț]+", " ", text).strip()

def grams(text: str, n: int = 4) -> set[str]:
    tokens = normalize(text).split()
    if len(tokens) < n:
        return {" ".join(tokens)}
    return {" ".join(tokens[i:i+n]) for i in range(len(tokens) - n + 1)}

def jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a or b else 0.0

def mutate(text: str, variant: int) -> tuple[str, str]:
    kind = variant % 10
    if kind == 0:
        return text, "plain"
    if kind == 1:
        return text.translate(str.maketrans("ăâîșțĂÂÎȘȚ", "aaistAAIST")), "no_diacritics"
    if kind == 2:
        return text.replace("poarta", "poartaa").replace("zborul", "zboru").replace("unde", "udne"), "typo"
    if kind == 3:
        return text.replace("este", "e").replace("pentru", "pt"), "terse"
    if kind == 4:
        return text.upper(), "caps"
    if kind == 5:
        return text.replace("te rog", "te rogg").replace("cât", "cat"), "informal"
    if kind == 6:
        return text + "????", "punctuation"
    if kind == 7:
        return "naibii, " + text, "profanity"
    if kind == 8:
        return "frate " + text + " că mă ia cu nervi", "slang"
    return "salut, " + text + ", mulțumesc", "polite"

def record(text: str, label: str, family: str, style: str, selected_flight_present: bool, last_intent: str) -> dict:
    return {"text": text, "label": label, "secondary_label": None, "selected_flight_present": selected_flight_present,
            "last_intent": last_intent, "expected_flightNumber": None,
            "expected_destination": None, "slice": "robust_v2", "family": family, "style": style}

def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default=str(OUT))
    parser.add_argument("--rejection-boost", action="store_true", help="add airport-adjacent OOD and ambiguity families")
    args = parser.parse_args()
    out_dir = Path(args.out_dir)
    random.seed(20261031)
    stress = json.loads(STRESS.read_text(encoding="utf-8"))
    stress_grams = [grams(item["question"]) for item in stress]
    legacy_train = load_jsonl(LEGACY / "train.jsonl")
    legacy_val = load_jsonl(LEGACY / "val.jsonl")
    legacy_test = load_jsonl(LEGACY / "test.jsonl")
    protected = [grams(row["text"]) for row in legacy_val + legacy_test] + stress_grams
    protected_index: dict[str, list[int]] = defaultdict(list)
    for protected_id, protected_grams in enumerate(protected):
        for gram in protected_grams:
            protected_index[gram].append(protected_id)

    def is_protected_similarity(candidate: set[str]) -> bool:
        candidates: set[int] = set()
        for gram in candidate:
            candidates.update(protected_index.get(gram, []))
        return any(jaccard(candidate, protected[idx]) >= 0.35 for idx in candidates)

    train_target = dict(TRAIN_TARGET)
    val_target = dict(VAL_TARGET)
    if args.rejection_boost:
        train_target.update({"none": 1800, "clarify": 1400})
        val_target.update({"none": 360, "clarify": 280})
    generated: dict[str, dict[str, list[dict]]] = {label: {"train": [], "val": []} for label in LABELS}
    seen: set[str] = set(normalize(row["text"]) for row in legacy_train + legacy_val + legacy_test)
    rejected = Counter()
    for label, standard_bases in BASES.items():
        bases = standard_bases + (REJECTION_BOOST.get(label, []) if args.rejection_boost else [])
        for family_id, base in enumerate(bases):
            split = "val" if family_id % 5 == 0 else "train"
            for variant in range(220):
                raw = f"{PREFIXES[variant % len(PREFIXES)]}{base}{CONTEXTS[(variant // 3) % len(CONTEXTS)]}{SUFFIXES[(variant // 7) % len(SUFFIXES)]}".strip()
                text, style = mutate(raw, variant)
                text = re.sub(r"\s+", " ", text).strip(" ,")
                key = normalize(text)
                if key in seen:
                    rejected["duplicate"] += 1
                    continue
                ng = grams(text)
                if is_protected_similarity(ng):
                    rejected["protected_similarity"] += 1
                    continue
                seen.add(key)
                selected = variant % 3 != 2
                last_intent = ("none", "get_flight_details", "get_gate", "none")[variant % 4]
                generated[label][split].append(record(text, label, f"{label}:{family_id}", style, selected, last_intent))

    robust_train, robust_val = [], []
    for label in LABELS:
        random.shuffle(generated[label]["train"])
        random.shuffle(generated[label]["val"])
        if len(generated[label]["train"]) < train_target[label] or len(generated[label]["val"]) < val_target[label]:
            raise RuntimeError(f"insufficient {label}: train={len(generated[label]['train'])} val={len(generated[label]['val'])}")
        robust_train.extend(generated[label]["train"][:train_target[label]])
        robust_val.extend(generated[label]["val"][:val_target[label]])

    # Legacy data carries prior English coverage. Filter it only against frozen benchmarks/test data.
    kept_legacy_train = []
    for row in legacy_train:
        ng = grams(row["text"])
        # Stress benchmark is the only frozen suite relevant to legacy train filtering.
        stress_candidates = set(idx for gram in ng for idx in protected_index.get(gram, []) if idx >= len(legacy_val) + len(legacy_test))
        if any(jaccard(ng, protected[idx]) >= 0.35 for idx in stress_candidates):
            rejected["legacy_stress_similarity"] += 1
        else:
            kept_legacy_train.append(row)
    train = kept_legacy_train + robust_train
    val = legacy_val + robust_val
    random.shuffle(train)
    random.shuffle(val)
    out_dir.mkdir(parents=True, exist_ok=True)
    write_jsonl(out_dir / "train.jsonl", train)
    write_jsonl(out_dir / "val.jsonl", val)
    write_jsonl(out_dir / "test.jsonl", legacy_test)
    shutil.copyfile(LEGACY / "benchmark_slices.json", out_dir / "benchmark_slices.json")
    report = {"seed": 20261031, "train": len(train), "val": len(val), "test": len(legacy_test),
              "robustTrain": dict(Counter(row["label"] for row in robust_train)), "robustVal": dict(Counter(row["label"] for row in robust_val)),
              "keptLegacyTrain": len(kept_legacy_train), "rejectionBoost": args.rejection_boost, "rejected": dict(rejected), "benchmark": str(STRESS.relative_to(ROOT))}
    (out_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
