"""Entity Extractor for FlightFlow Intent Classifier.
Extracts:
  - flightNumber (IATA/ICAO airline code + number)
  - destination (airport facility/place name)
Evaluated separately for precision, recall, and F1.
"""

import re
from typing import Dict, Optional, Tuple, List, Any

# IATA/ICAO Flight Number regex (matches RO301, W6 3301, W63301, LH1400, TAR202, DEMO123, etc.)
# Disallows standalone gate codes like B12 or random acronyms like COVID19 or MP3.
FLIGHT_NO_RE = re.compile(
    r"\b([A-Z]{2}\s?\d{2,4}|[A-Z]\d\s?\d{3,4}|\d[A-Z]\s?\d{3,4}|[A-Z]{3}\s?\d{2,4}|DEMO\s?\d{1,4})\b",
    re.IGNORECASE,
)

# Places and facilities in airport for open_airport_map
DESTINATION_MAP = [
    (re.compile(r"\b(toalet[a-z]*|baie|baia|wc|restroom|bathroom|toilet[s]?)\b", re.IGNORECASE), "toaleta"),
    (re.compile(r"\b(iesir[a-z]*|exit[s]?)\b", re.IGNORECASE), "iesirea"),
    (re.compile(r"\b(control(ul)? de securitat[a-z]*|security( check)?)\b", re.IGNORECASE), "controlul de securitate"),
    (re.compile(r"\b(ghiseu[a-z]* de informati[a-z]*|info desk|information desk)\b", re.IGNORECASE), "ghiseul de informatii"),
    (re.compile(r"\b(restaurant[a-z]*|cafenea|cafea|cafe|mancare|food|bufet)\b", re.IGNORECASE), "restaurant sau cafenea"),
    (re.compile(r"\b(parcar[a-z]*|car\s?park|parking)\b", re.IGNORECASE), "parcarea"),
    (re.compile(r"\b(taxi[a-z]*|cab[s]?)\b", re.IGNORECASE), "taxiurile"),
    (re.compile(r"\b(bagaj[a-z]*|baggage claim|luggage area|banda de bagaje)\b", re.IGNORECASE), "zona de bagaje"),
    (re.compile(r"\b(check[- ]?in)\b", re.IGNORECASE), "check-in"),
    (re.compile(r"\b(farmaci[a-z]*|pharmacy)\b", re.IGNORECASE), "farmacia"),
    (re.compile(r"\b(prim ajutor|medical|first aid)\b", re.IGNORECASE), "punctul de prim ajutor"),
    (re.compile(r"\b(atm|bancomat|cash machine)\b", re.IGNORECASE), "bancomatul"),
    (re.compile(r"\b(inchirier[a-z]* auto|car rental)\b", re.IGNORECASE), "birourile de inchirieri auto"),
    (re.compile(r"\b(duty[- ]?free|magazine|shops)\b", re.IGNORECASE), "duty-free"),
    (re.compile(r"\b(oficiu[a-z]* postal|posta|post\s?office)\b", re.IGNORECASE), "oficiul postal"),
    (re.compile(r"\b(salon(ul)? lounge|business lounge)\b", re.IGNORECASE), "salonul business"),
    (re.compile(r"\b(poarta|gate)\b", re.IGNORECASE), "poarta mea"),
]


def normalize_dest(d: Optional[str]) -> Optional[str]:
    if not d:
        return None
    d = d.lower().replace("ș", "s").replace("ş", "s").replace("ț", "t").replace("ţ", "t").replace("ă", "a").replace("â", "a").replace("î", "i").strip()
    synonyms = {
        "post office": "oficiul postal",
        "posta": "oficiul postal",
        "oficiul postal": "oficiul postal",
        "toilet": "toaleta",
        "restroom": "toaleta",
        "bathroom": "toaleta",
        "wc": "toaleta",
        "exit": "iesirea",
        "security": "controlul de securitate",
    }
    return synonyms.get(d, d)
    """Extracts flightNumber and destination from text."""
    flight_number = None
    fn_match = FLIGHT_NO_RE.search(text)
    if fn_match:
        # Standardize flight number: uppercase, remove intra-spaces (e.g. "W6 3301" -> "W63301")
        raw_fn = fn_match.group(1).upper()
        # Verify it's not a common false positive word like "AT12" or gate
        cleaned_fn = raw_fn.replace(" ", "")
        # Extra filter: flight codes are 2-3 letters followed by 2-4 digits or 1 letter+1 digit
        if not re.match(r"^[A-Z]\d{1,2}$", cleaned_fn):  # Not gate B12
            flight_number = cleaned_fn

    destination = None
    for pattern, canonical_dest in DESTINATION_MAP:
        if pattern.search(text):
            destination = canonical_dest
            break

def extract_entities(text: str) -> Dict[str, Optional[str]]:
    """Extracts flightNumber and destination from text."""
    flight_number = None
    fn_match = FLIGHT_NO_RE.search(text)
    if fn_match:
        raw_fn = fn_match.group(1).upper()
        cleaned_fn = raw_fn.replace(" ", "")
        if not re.match(r"^[A-Z]\d{1,2}$", cleaned_fn):
            flight_number = cleaned_fn

    destination = None
    for pattern, canonical_dest in DESTINATION_MAP:
        if pattern.search(text):
            destination = canonical_dest
            break

    return {
        "flightNumber": flight_number,
        "destination": destination,
    }


def evaluate_entity_extraction(ground_truth_samples: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    """Evaluates Precision, Recall, and F1 for flightNumber and destination extraction."""
    metrics = {
        "flightNumber": {"tp": 0, "fp": 0, "fn": 0},
        "destination": {"tp": 0, "fp": 0, "fn": 0},
    }

    for sample in ground_truth_samples:
        text = sample["text"]
        preds = extract_entities(text)
        gt_fn = sample.get("expected_flightNumber")
        gt_dest = sample.get("expected_destination")

        # Flight Number
        pred_fn = preds["flightNumber"]
        if gt_fn and pred_fn:
            if gt_fn.upper().replace(" ", "") == pred_fn.upper().replace(" ", ""):
                metrics["flightNumber"]["tp"] += 1
            else:
                metrics["flightNumber"]["fp"] += 1
                metrics["flightNumber"]["fn"] += 1
        elif gt_fn and not pred_fn:
            metrics["flightNumber"]["fn"] += 1
        elif not gt_fn and pred_fn:
            metrics["flightNumber"]["fp"] += 1

        # Destination
        pred_dest = normalize_dest(preds["destination"])
        norm_gt_dest = normalize_dest(gt_dest)
        if norm_gt_dest and pred_dest:
            if norm_gt_dest == pred_dest:
                metrics["destination"]["tp"] += 1
            else:
                metrics["destination"]["fp"] += 1
                metrics["destination"]["fn"] += 1
        elif norm_gt_dest and not pred_dest:
            metrics["destination"]["fn"] += 1
        elif not norm_gt_dest and pred_dest:
            metrics["destination"]["fp"] += 1

    results = {}
    for entity, counts in metrics.items():
        tp, fp, fn = counts["tp"], counts["fp"], counts["fn"]
        prec = tp / (tp + fp) if (tp + fp) > 0 else 1.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 1.0
        f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0
        results[entity] = {
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
            "support": tp + fn,
        }

    return results
