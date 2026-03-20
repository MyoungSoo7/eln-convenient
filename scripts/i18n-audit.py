#!/usr/bin/env python3
"""i18n key mismatch audit: code vs JSON translation files."""
import re, json, os, glob

def flatten(d, prefix=""):
    keys = set()
    for k, v in d.items():
        full = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys |= flatten(v, full)
        else:
            keys.add(full)
    return keys

ko_dir = "src/i18n/locales/ko"
en_dir = "src/i18n/locales/en"
ns_keys_ko = {}
ns_keys_en = {}

for f in sorted(glob.glob(f"{ko_dir}/*.json")):
    ns = os.path.basename(f).replace(".json", "")
    with open(f, encoding="utf-8") as fh:
        ns_keys_ko[ns] = flatten(json.load(fh))

for f in sorted(glob.glob(f"{en_dir}/*.json")):
    ns = os.path.basename(f).replace(".json", "")
    with open(f, encoding="utf-8") as fh:
        ns_keys_en[ns] = flatten(json.load(fh))

# Find t() / tc() calls grouped by namespace
tsx_files = glob.glob("src/**/*.tsx", recursive=True) + glob.glob("src/**/*.ts", recursive=True)
tsx_files = [f for f in tsx_files if "node_modules" not in f and "i18n/" not in f.replace("\\", "/")]

# ns -> set of keys
ns_used = {}

for fp in tsx_files:
    with open(fp, encoding="utf-8") as fh:
        content = fh.read()

    # useTranslation('ns')  or  useTranslation("ns")
    ns_matches = re.findall(r"useTranslation\(\s*['\"](\w+)['\"]\s*\)", content)
    if not ns_matches and "useTranslation()" in content:
        ns_matches = ["common"]

    # Collect t('...') and tc('...') calls
    t_keys = re.findall(r"\bt\s*\(\s*['\"]([^'\"]+)['\"]", content)
    tc_keys = re.findall(r"\btc\s*\(\s*['\"]([^'\"]+)['\"]", content)

    for ns in ns_matches:
        if ns not in ns_used:
            ns_used[ns] = set()
        for k in t_keys:
            ns_used[ns].add(k)

    # tc() typically uses 'common' namespace
    if tc_keys:
        if "common" not in ns_used:
            ns_used["common"] = set()
        for k in tc_keys:
            ns_used["common"].add(k)

# Compare
print("=" * 70)
print("I18N KEY MISMATCH REPORT")
print("=" * 70)

total_missing = 0
total_unused = 0

for ns in sorted(set(list(ns_keys_ko.keys()) + list(ns_used.keys()))):
    json_keys = ns_keys_ko.get(ns, set())
    code_keys = ns_used.get(ns, set())
    missing = code_keys - json_keys
    unused = json_keys - code_keys

    if missing or unused:
        print(f"\n### {ns}.json")
        if missing:
            print(f"  MISSING (code uses, JSON lacks) [{len(missing)}]:")
            for k in sorted(missing):
                total_missing += 1
                print(f"    - {k}")
        if unused:
            print(f"  UNUSED (JSON has, code never uses) [{len(unused)}]:")
            for k in sorted(unused):
                total_unused += 1
                print(f"    - {k}")
    else:
        print(f"\n### {ns}.json  -- OK (no mismatches)")

# KO vs EN parity
print(f"\n{'=' * 70}")
print("KO vs EN PARITY")
print("=" * 70)
parity_ok = True
for ns in sorted(ns_keys_ko.keys()):
    ko = ns_keys_ko.get(ns, set())
    en = ns_keys_en.get(ns, set())
    ko_only = ko - en
    en_only = en - ko
    if ko_only or en_only:
        parity_ok = False
        print(f"\n  {ns}.json:")
        if ko_only:
            print(f"    KO only: {sorted(ko_only)}")
        if en_only:
            print(f"    EN only: {sorted(en_only)}")
if parity_ok:
    print("  All namespaces have perfect KO/EN parity.")

print(f"\n{'=' * 70}")
print(f"TOTALS:  Missing={total_missing}  Unused={total_unused}")
print("=" * 70)
