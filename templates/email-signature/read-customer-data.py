#!/usr/bin/env python3
"""Liest customer-X/src/data/site-data.ts + tokens.css → Shell-ENV-Vars.

Usage:
  read-customer-data.py <customer-dir>             # → eval-able shell exports
  read-customer-data.py <customer-dir> --list-persons  # → JSON-Array der persons[]
"""
import sys, re, json
from pathlib import Path

if len(sys.argv) < 2:
    print("Usage: read-customer-data.py <customer-dir> [--list-persons]", file=sys.stderr)
    sys.exit(1)

customer_dir = Path(sys.argv[1])
list_persons_mode = "--list-persons" in sys.argv[2:]
sd_path = customer_dir / "src/data/site-data.ts"
tk_path = None
for p in ["src/styles/tokens.css", "src/styles/global.css", "src/styles/theme.css"]:
    cand = customer_dir / p
    if cand.exists():
        tk_path = cand
        break

content = sd_path.read_text() if sd_path.exists() else ""

def extract_block(name, src=content):
    """Greedy-find the named block: { ... } at top-level."""
    m = re.search(rf"\b{name}:\s*\{{", src)
    if not m:
        return ""
    start = m.end()
    depth = 1
    i = start
    while i < len(src) and depth > 0:
        if src[i] == "{": depth += 1
        elif src[i] == "}": depth -= 1
        i += 1
    return src[start:i-1]

def kv(block, key, default=""):
    m = re.search(rf"\b{key}:\s*['\"]([^'\"]+)['\"]", block)
    return m.group(1) if m else default

def kv_arr(block, key, idx=0, default=""):
    """For array-of-strings: just take first match."""
    m = re.search(rf"\b{key}:\s*['\"]([^'\"]+)['\"]", block)
    return m.group(1) if m else default

# Top-level fields
name = kv(content, "name")
url = kv(content, "url")
tagline = kv(content, "tagline")

# legal block
legal = extract_block("legal")
form = kv(legal, "form") or kv(legal, "rechtsform")
owner = kv(legal, "owner") or kv(legal, "company")
street = kv(legal, "street")
zip_ = kv(legal, "zip")
city = kv(legal, "city")
phone = kv(legal, "phone")
email = kv(legal, "email")
ust_id = kv(legal, "ustIdNr") or kv(legal, "taxId")
hrb = kv(legal, "handelsregister")
if not hrb:
    reg = kv(legal, "register")
    # customer-site-data.ts fuehrt die englische Schreibweise als SSOT
    # (registerNumber/registerCourt); die deutsche ist Bestand. ImpressumBlock
    # kennt beide seit jeher — hier fehlte die englische, weshalb bei
    # customer-zink-baeckerei und customer-mika-elektrotechnik die
    # Handelsregister-Zeile still ausfiel (35a HGB-Pflichtangabe).
    nr = kv(legal, "registerNummer") or kv(legal, "registerNumber")
    if reg and nr:
        # Die beiden Schreibweisen sind unterschiedlich befuellt: registerNummer
        # (deutsch) traegt nur die Ziffern ("11164"), registerNumber (englisch)
        # das Praefix gleich mit ("HRB 2749"). Ohne diese Pruefung stand in der
        # Signatur "HRB HRB 2749".
        hrb = nr if nr.upper().startswith(reg.upper()) else f"{reg.upper()} {nr}"
registergericht = (
    kv(legal, "registergericht")
    or kv(legal, "registerCourt")
    or kv(legal, "registry")
)

# representatives[] (GbR/OHG/KG): alle vertretungsberechtigten Gesellschafter
representatives = ""
rm_match = re.search(r"representatives:\s*\[([^\]]*)\]", legal)
if rm_match:
    names = re.findall(r"['\"]([^'\"]+)['\"]", rm_match.group(1))
    representatives = ", ".join(names)

# contact block (fallback for phone if not in legal)
contact = extract_block("contact")
phone = phone or kv(contact, "phone") or kv(contact, "telefon")

# v4 email-sig blocks
gmb = extract_block("gmb")
gmb_review_url = kv(gmb, "review_url")
booking = extract_block("booking")
booking_url = kv(booking, "url")
booking_label = kv(booking, "label", "Termin vereinbaren")

# tokens.css → primary/accent
color_primary = "#000000"
color_accent = "#666666"
if tk_path:
    css = tk_path.read_text()
    mp = re.search(r"--color-primary:\s*([^;]+);", css)
    ma = re.search(r"--color-accent:\s*([^;]+);", css)
    if mp: color_primary = mp.group(1).strip()
    if ma: color_accent = ma.group(1).strip()

# persons[] block (v6) — JSON-Array
def extract_persons():
    """Parse persons: [ { ... }, { ... } ] from site-data.ts."""
    m = re.search(r"\bpersons:\s*\[", content)
    if not m:
        return []
    start = m.end()
    depth = 1
    i = start
    while i < len(content) and depth > 0:
        if content[i] == "[": depth += 1
        elif content[i] == "]": depth -= 1
        i += 1
    arr_body = content[start:i-1]

    persons = []
    obj_depth = 0
    obj_start = None
    for j, ch in enumerate(arr_body):
        if ch == "{":
            if obj_depth == 0:
                obj_start = j + 1
            obj_depth += 1
        elif ch == "}":
            obj_depth -= 1
            if obj_depth == 0 and obj_start is not None:
                obj_body = arr_body[obj_start:j]
                p = {}
                for km in re.finditer(r"(\w+):\s*['\"]([^'\"]*)['\"]", obj_body):
                    p[km.group(1)] = km.group(2)
                if p:
                    persons.append(p)
                obj_start = None
    return persons

if list_persons_mode:
    print(json.dumps(extract_persons(), ensure_ascii=False))
    sys.exit(0)

# Output as shell-eval-able exports
def esc(v):
    return v.replace('"', '\\"').replace("`", "\\`").replace("$", "\\$")

out = {
    "CUSTOMER_NAME": name,
    "CUSTOMER_URL": url,
    "TAGLINE": tagline,
    "COMPANY_NAME": name,
    "LEGAL_FORM": form,
    "GF_NAME": owner,
    "REPRESENTATIVES": representatives,
    "STREET": street,
    "ZIP_CITY": f"{zip_} {city}".strip(),
    "PHONE": phone,
    "EMAIL_LEGAL": email,
    "UST_ID": ust_id,
    "HRB": hrb,
    "REGISTERGERICHT": registergericht,
    "COLOR_PRIMARY": color_primary,
    "COLOR_ACCENT": color_accent,
    "GOOGLE_REVIEW_URL": gmb_review_url,
    "BOOKING_URL": booking_url,
    "BOOKING_LABEL": booking_label,
}

for k, v in out.items():
    print(f'export {k}="{esc(v)}"')
