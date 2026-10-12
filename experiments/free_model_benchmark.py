#!/usr/bin/env python3
"""KERO free-only model benchmark. Run locally or in an isolated test environment.
Never calls a paid OpenRouter model. Only explicit :free IDs with zero listed pricing.
Requires OPENROUTER_API_KEY and/or GEMINI_API_KEY.
"""
import json, os, time, urllib.request, urllib.error, pathlib, datetime, ast, re

BASE = "https://openrouter.ai/api/v1"
OPENROUTER_CANDIDATES = [
    "openai/gpt-oss-20b:free",
    "openai/gpt-oss-120b:free",
]
# Free specialist fallbacks; every one is re-checked against live pricing.
FREE_FALLBACK_CANDIDATES = [
    "cohere/north-mini-code:free",
    "google/gemma-4-31b-it:free",
    "apodex/apodex-1.1-mini:free",
    "poolside/laguna-s-2.1:free",
]
GEMINI_MODEL = os.getenv("KERO_TEST_GEMINI_MODEL", "gemini-2.5-flash")
TASKS = {
    "coding": "Python ile verilen sayi listesinin medyanini bulan, bos listeyi ValueError ile reddeden fonksiyon ve 3 unittest yaz. Sadece kod ver.",
    "planning": "Bir emlak ofisinin mevcut yazilimi sadece portfoy kaydi ve personel hesabini destekliyor. CRM veya portal entegrasyonu uydurmadan, 3 maddelik 1 aylik uygulama plani yaz. Turkce yanit ver.",
}
TIMEOUT = int(os.getenv("KERO_BENCH_TIMEOUT", "35"))
MAX_OUTPUT = 1100

def request_json(url, payload=None, headers=None, timeout=10):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)

def verify_free_ids():
    models = request_json(BASE + "/models", timeout=12).get("data", [])
    result = {}
    for m in models:
        ident, price = m.get("id", ""), m.get("pricing", {})
        if not ident.endswith(":free"):
            continue
        try:
            if float(price.get("prompt", -1)) == 0 and float(price.get("completion", -1)) == 0:
                result[ident] = True
        except (ValueError, TypeError):
            pass
    return result

def run_openrouter(model, prompt):
    return request_json(BASE + "/chat/completions", {
        "model": model, "messages": [{"role": "user", "content": prompt}],
        "max_tokens": MAX_OUTPUT, "temperature": 0,
        "provider": {"allow_fallbacks": False}
    }, {"Authorization": "Bearer " + os.environ["OPENROUTER_API_KEY"],
        "Content-Type": "application/json"}, TIMEOUT)

def run_gemini(prompt):
    # This path requires checking the account's own free-tier eligibility beforehand.
    import urllib.parse
    url = "https://generativelanguage.googleapis.com/v1beta/models/" + urllib.parse.quote(GEMINI_MODEL, safe="-_.") + ":generateContent"
    return request_json(url, {"contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": MAX_OUTPUT, "temperature": 0}},
        {"x-goog-api-key": os.environ["GEMINI_API_KEY"], "Content-Type": "application/json"}, TIMEOUT)

def summarize_openrouter(r):
    choices = r.get("choices", [])
    return (choices[0].get("message", {}).get("content") or "") if choices else ""

def summarize_gemini(r):
    return "".join(p.get("text", "") for c in r.get("candidates", []) for p in c.get("content", {}).get("parts", []))

def assess_response(task, answer):
    """Cheap deterministic checks, not a substitute for reviewing/running generated code."""
    if not answer.strip():
        return "empty_response"
    if task == "coding":
        code = answer.strip()
        if code.startswith("```"):
            code = re.sub(r"^\`\`\`(?:python)?\\s*", "", code)
            code = re.sub(r"\\s*\`\`\`$", "", code)
        try:
            parsed = ast.parse(code)
        except SyntaxError:
            return "invalid_or_truncated_python"
        functions = [n.name for n in ast.walk(parsed) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        return "basic_syntax_and_tests_present" if "median" in functions and sum(n.startswith("test_") for n in functions) >= 3 else "missing_required_tests"
    # A suspicious mention can be a negation, so flag for review, not a definite fail.
    if re.search(r"\\b(?:crm|portal)\\b", answer, flags=re.IGNORECASE):
        return "review_required_mentions_unavailable_features"
    return "manual_review_required"

def main():
    output = {"timestamp_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "results": []}
    try:
        free = verify_free_ids()
    except Exception as e:
        print("OpenRouter ucretsiz model listesi dogrulanamadi; OpenRouter testleri atlandi:", type(e).__name__)
        free = {}
    # Prioritize requested GPT models if truly free today, then free Qwen,
    # then verified coding/general-purpose alternatives; cap calls at 4 models.
    free_qwen = sorted(m for m in free if m.startswith("qwen/") and m.endswith(":free"))
    eligible = OPENROUTER_CANDIDATES + free_qwen + FREE_FALLBACK_CANDIDATES
    selected = list(dict.fromkeys(m for m in eligible if m in free))[:4]
    output["requested_free_gpt_unavailable"] = [m for m in OPENROUTER_CANDIDATES if m not in free]
    output["tested_free_model_ids"] = selected
    candidates = [(m, "openrouter") for m in selected] if os.getenv("OPENROUTER_API_KEY") else []
    print("Verified free candidates:", ", ".join(selected) or "none", flush=True)
    if output["requested_free_gpt_unavailable"]:
        print("Requested GPT :free endpoint(s) absent from the zero-price catalog:", ", ".join(output["requested_free_gpt_unavailable"]), flush=True)
    # Gemini is opt-in: free-tier availability is account- and model-specific.
    if os.getenv("KERO_TEST_GEMINI_FREE_CONFIRMED") == "1" and os.getenv("GEMINI_API_KEY"):
        candidates.append((GEMINI_MODEL, "gemini"))
    for model, provider in candidates:
        for label, prompt in TASKS.items():
            started = time.perf_counter()
            row = {"model": model, "provider": provider, "task": label}
            try:
                response = run_openrouter(model, prompt) if provider == "openrouter" else run_gemini(prompt)
                answer = summarize_openrouter(response) if provider == "openrouter" else summarize_gemini(response)
                row.update({"success": bool(answer.strip()), "duration_seconds": round(time.perf_counter() - started, 3),
                            "answer": answer[:9000], "quality_check": assess_response(label, answer)})
            except Exception as exc:
                row.update({"success": False, "duration_seconds": round(time.perf_counter() - started, 3),
                            "error_type": type(exc).__name__, "error": str(exc)[:180], "quality_check": "not_applicable"})
            output["results"].append(row)
            print(model, label, row["duration_seconds"], "OK" if row["success"] else "FAIL", row.get("quality_check", ""), flush=True)
    pathlib.Path("free_model_benchmark_results.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Results written to free_model_benchmark_results.json")
    if not candidates:
        print("No verified free models/credentials available; no API calls made.")

if __name__ == "__main__":
    main()
