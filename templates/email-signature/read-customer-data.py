#!/usr/bin/env python3
"""Liest customer-X/src/data/site-data.ts + tokens.css → Shell-ENV-Vars."""
import sys, re, os, json
from pathlib import Path

if len(sys.argv) < 2:
    print("Usage: read-customer-data.py <customer-dir>", file=sys.stderr)
    sys.exit(1)

customer_dir = Path(sys.argv[1])
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
    nr = kv(legal, "registerNummer")
    if reg and nr:
        hrb = f"{reg.upper()} {nr}"
registergericht = kv(legal, "registergericht") or kv(legal, "registry")

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
