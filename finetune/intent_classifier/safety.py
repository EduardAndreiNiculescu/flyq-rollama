"""Safety, OOD, and Emergency Pre-Filter for FlightFlow Intent Classifier.
Strict isolation: detects out-of-domain gibberish, prompt injections, and emergency queries.
Zero false executions allowed on adversarial input.
"""

import re
import math
from typing import Dict, Any, NamedTuple


class SafetyVerdict(NamedTuple):
    is_safe: bool
    is_emergency: bool
    is_injection: bool
    is_ood: bool
    label: str  # 'none' or 'clarify'
    action: str  # 'none' or 'emergency_alert'
    reason: str


# Regular expressions for prompt injection / jailbreak / system manipulation
INJECTION_PATTERNS = [
    re.compile(r"\b(ignore|ignora|forget|uita)\s+(all\s+)?(previous\s+)?(instructions|reguli|instructiuni)", re.IGNORECASE),
    re.compile(r"\b(system\s+prompt|mod\s+dezvoltator|developer\s+mode|dan\s+mode|jailbreak)\b", re.IGNORECASE),
    re.compile(r"\b(ruleaza|run|exec|execute|apeleaza)\s+(toate\s+)?(uneltele|tools|functiile)\b", re.IGNORECASE),
    re.compile(r"\b(sterge|drop|delete|truncate)\s+(baza|database|table|tablele)\b", re.IGNORECASE),
    re.compile(r"<script[\s>]", re.IGNORECASE),
    re.compile(r"\b(eval|exec|subprocess|system)\s*\(", re.IGNORECASE),
    re.compile(r"\b(give\s+me\s+root|bypass\s+auth|sudo\s+rm)\b", re.IGNORECASE),
    re.compile(r"\b(output\s+system\s+message|reveal\s+instructions)\b", re.IGNORECASE),
]

# Regular expressions for negations (queries explicitly rejecting tools/features)
NEGATION_PATTERNS = [
    re.compile(r"\b(nu\s+vreau|nu\s+cauta|nu\s+arata|nu\s+deschide|fara|nu\s+ma\s+intereseaza)\b", re.IGNORECASE),
    re.compile(r"\b(don'?t\s+open|don'?t\s+show|do\s+not\s+look|no\s+tracking|no\s+gate|not\s+the\s+gate)\b", re.IGNORECASE),
    re.compile(r"\b(nu\s+imi\s+arata|nu\s+afisa|fara\s+harta|fara\s+poarta)\b", re.IGNORECASE),
]

# Regular expressions for identity, meta, and obvious chitchat
CHITCHAT_PATTERNS = [
    re.compile(r"\b(cum\s+te\s+cheama|what\s+is\s+your\s+name|who\s+are\s+you|cine\s+esti|ce\s+esti)\b", re.IGNORECASE),
    re.compile(r"\b(what\s+can\s+i\s+ask|ce\s+poti\s+(sa\s+)?faci|ce\s+stii\s+sa\s+faci)\b", re.IGNORECASE),
    re.compile(r"\b(what\s+star\s+sign|ce\s+zodie|spune[- ]mi\s+o\s+gluma|spune[- ]mi\s+un\s+banc|scrie[- ]mi\s+o\s+poezie|tell\s+me\s+a\s+joke)\b", re.IGNORECASE),
    re.compile(r"\b(who\s+will\s+win|cine\s+castiga|vremea(?:\s+\w+){0,5}|weather\s+in)\b", re.IGNORECASE),
]

# FlightFlow can retrieve airport and flight facts, but it cannot perform
# commercial/account actions.  Reject these before intent classification so an
# airport word ("poartă", "terminal", "zbor") cannot turn an unsupported
# request into a knowledge or map tool call.
UNSUPPORTED_CAPABILITY_PATTERNS = [
    re.compile(r"\b(check[ -]?in|checkin)\b", re.IGNORECASE),
    re.compile(r"\b(rezerv[aă]|cump[aă]r[aă]|anuleaz[aă]|schimb[aă]|mut[aă]|pl[ăa]te[șs]te|comand[aă]|activeaz[aă]|sun[aă])\b", re.IGNORECASE),
    re.compile(r"\b(upgrade|business\s+class|hotel|taxi|uber|bolt|wi[ -]?fi|parol[aă]\s+(de\s+)?(wi[ -]?fi|internet))\b", re.IGNORECASE),
]

# Regular expressions for medical / life safety emergencies
EMERGENCY_PATTERNS = [
    re.compile(r"\b(infarct|stop\s+cardiac|heart\s+attack)\b", re.IGNORECASE),
    re.compile(r"\b(nu\s+mai\s+pot\s+respira|nu\s+respir|can'?t\s+breathe|choking|ma\s+sufoc)\b", re.IGNORECASE),
    re.compile(r"\b(urgenta\s+medicala|medical\s+emergency|ajutor\s+medical\s+urgent)\b", re.IGNORECASE),
    re.compile(r"\b(chemati\s+(o\s+)?(salvare|ambulanta)|call\s+(an\s+)?ambulance)\b", re.IGNORECASE),
    re.compile(r"\b(incendiu|foc\s+in\s+aeroport|bomba\s+in|bomb\s+threat|atac\s+terorist|terorism)\b", re.IGNORECASE),
    re.compile(r"\b(hemoragie\s+severa|sangerare\s+grava|severe\s+bleeding)\b", re.IGNORECASE),
    re.compile(r"\b(politie\s+urgenta|call\s+police\s+now)\b", re.IGNORECASE),
]

# Common keyboard smashing or repeated noise patterns
GIBBERISH_REGEX = re.compile(r"^(.)\1{4,}$")  # e.g. "aaaaaa", "11111"


def calculate_entropy(s: str) -> float:
    """Shannon entropy of characters in string."""
    if not s:
        return 0.0
    freq: Dict[str, int] = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    entropy = 0.0
    for count in freq.values():
        p = count / len(s)
        entropy -= p * math.log2(p)
    return entropy


def inspect_safety(text: str) -> SafetyVerdict:
    """Evaluates safety of input text.
    
    Returns SafetyVerdict. If unsafe:
      - emergency -> action='emergency_alert', label='clarify'
      - injection -> action='none', label='none'
      - ood / gibberish -> action='none', label='none'
    """
    cleaned = text.strip()
    if not cleaned:
        return SafetyVerdict(
            is_safe=False,
            is_emergency=False,
            is_injection=False,
            is_ood=True,
            label="none",
            action="none",
            reason="Empty input",
        )

    # 1. Emergency detection (highest priority - immediate safety assistance)
    for pat in EMERGENCY_PATTERNS:
        if pat.search(cleaned):
            return SafetyVerdict(
                is_safe=False,
                is_emergency=True,
                is_injection=False,
                is_ood=False,
                label="clarify",
                action="emergency_alert",
                reason=f"Emergency trigger matched: {pat.pattern}",
            )

    # 2. Prompt injection / adversarial detection
    for pat in INJECTION_PATTERNS:
        if pat.search(cleaned):
            return SafetyVerdict(
                is_safe=False,
                is_emergency=False,
                is_injection=True,
                is_ood=False,
                label="none",
                action="none",
                reason=f"Prompt injection matched: {pat.pattern}",
            )

    # 3. Explicit negation detection
    for pat in NEGATION_PATTERNS:
        if pat.search(cleaned):
            return SafetyVerdict(
                is_safe=False,
                is_emergency=False,
                is_injection=False,
                is_ood=False,
                label="none",
                action="none",
                reason=f"Negation matched: {pat.pattern}",
            )

    # 4. Obvious chitchat / out-of-scope identity detection
    for pat in UNSUPPORTED_CAPABILITY_PATTERNS:
        if pat.search(cleaned):
            return SafetyVerdict(
                is_safe=False,
                is_emergency=False,
                is_injection=False,
                is_ood=True,
                label="none",
                action="none",
                reason=f"Unsupported capability matched: {pat.pattern}",
            )

    # 5. Obvious chitchat / out-of-scope identity detection
    for pat in CHITCHAT_PATTERNS:
        if pat.search(cleaned):
            return SafetyVerdict(
                is_safe=False,
                is_emergency=False,
                is_injection=False,
                is_ood=True,
                label="none",
                action="none",
                reason=f"Chitchat/Out-of-scope matched: {pat.pattern}",
            )

    # 6. OOD / Gibberish detection
    if GIBBERISH_REGEX.match(cleaned):
        return SafetyVerdict(
            is_safe=False,
            is_emergency=False,
            is_injection=False,
            is_ood=True,
            label="none",
            action="none",
            reason="Repeated character pattern",
        )

    # Symbol ratio check (e.g. "@#$%^&*()_+")
    alpha_num_count = sum(1 for c in cleaned if c.isalnum() or c.isspace())
    if len(cleaned) >= 4 and (alpha_num_count / len(cleaned)) < 0.4:
        return SafetyVerdict(
            is_safe=False,
            is_emergency=False,
            is_injection=False,
            is_ood=True,
            label="none",
            action="none",
            reason="High non-alphanumeric symbol ratio",
        )

    # Extremely low entropy for strings >= 10 chars
    if len(cleaned) >= 10 and calculate_entropy(cleaned) < 1.4:
        return SafetyVerdict(
            is_safe=False,
            is_emergency=False,
            is_injection=False,
            is_ood=True,
            label="none",
            action="none",
            reason="Low character entropy (repetition)",
        )

    return SafetyVerdict(
        is_safe=True,
        is_emergency=False,
        is_injection=False,
        is_ood=False,
        label="",
        action="execute",
        reason="Passed safety filters",
    )
