"""Free-only OpenRouter planning specialist; this module never runs tools or changes files."""

from collections.abc import Mapping, Sequence
import logging
import time

import httpx

# Pin the free variant so no paid OpenRouter model can be selected by request data.
PLANNING_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_INSTRUCTION = (
    "Sen KERO'nun Türkçe planlama uzmanısın. Kısa, somut, tutarlı ve "
    "Türkiye bağlamına uygun çalış. 3 aşamalı plan yaz, her aşamada "
    "2-3 uygulanabilir iş ve ölçme yöntemi belirt. Yaklaşık 180-230 "
    "Türkçe kelimeyi hedefle; gereksiz tablo, tekrar, yabancı alfabe kullanma. "
    "Kritik doğruluk kuralı: Kullanıcı bir yazılımı, CRM'i veya uygulamayı "
    "kullandığını söyledi diye o üründe belirli modül, entegrasyon, API/XML, "
    "portal yayını, müşteri otomasyonu, görev şablonu veya KVKK onay kaydı "
    "bulunduğunu ASLA varsayma. Kullanıcı açıkça çalıştığını belirtmediği "
    "her yetenek henüz doğrulanmamıştır. 'X entegrasyonunu Atlas'ta test et' "
    "gibi etkin olduğu varsayılan talimatlar yerine, 'önce varlığını ve "
    "erişim yetkisini doğrula; mevcutsa test et, yoksa geliştirme öner' de. "
    "Güçlü kanıt yoksa ürünün geçmişini, lisansını, yeteneklerini ve "
    "mevcut iş akışını biliyormuş gibi konuşma. Mevcut doğrulanmış bilgiler "
    "ile önerilen işler ve varsayımsal KPI hedeflerini birbirinden ayır. "
    "Türkiye'de ABD'ye özgü IDX/MLS'yi yerel standart gibi önerme. "
    "Sahibinden, Emlakjet, Hepsiemlak gibi portal API/XML bağlantılarını "
    "doğrulanmış erişim gibi anlatma; koşulları kontrol etmeyi öner. "
    "KVKK aydınlatma yükümlülüğü ile açık rızayı ayır; her işlem için "
    "otomatik açık rıza gerekir deme, hukukî kesinlik iddia etme. "
    "Çalışan sayısı, satış, gelir, dönüşüm oranı gibi sayıları veriden "
    "bilmiyorsan örnek hedef veya doğrulama gerektiren varsayım olarak yaz. "
    "Web'e veya araçlara erişimin yoktur; eylem gerçekleştirdim deme."
)
# Output cap prevents unlimited multi-page plans and reduces typical latency.
MAX_OUTPUT_TOKENS = 600
REQUEST_TIMEOUT_SECONDS = 34
logger = logging.getLogger("uvicorn.error")


class PlannerReplyError(ValueError):
    """OpenRouter returned no usable assistant text."""


def parse_planner_reply(data: dict) -> str:
    try:
        content = data["choices"][0]["message"]["content"]
        if isinstance(content, str):
            result = content.strip()
        elif isinstance(content, list):
            result = "".join(
                part.get("text", "") for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            ).strip()
        else:
            result = ""
    except (KeyError, IndexError, TypeError) as exc:
        raise PlannerReplyError("Planlama uzmanı geçerli bir yanıt vermedi.") from exc
    if not result:
        raise PlannerReplyError("Planlama uzmanından boş yanıt alındı.")
    if any("\u0400" <= char <= "\u052f" or "\uac00" <= char <= "\ud7af" for char in result):
        raise PlannerReplyError("Planlama yanıtında beklenmeyen yabancı alfabe tespit edildi.")
    return result


async def create_plan(
    task: str,
    *,
    api_key: str,
    client: httpx.AsyncClient | None = None,
    history: Sequence[Mapping[str, str]] | None = None,
) -> str:
    """Obtain a text-only planning suggestion from the pinned free model."""
    # Keep only a small, validated part of the dialogue for continuity.
    messages = [{"role": "system", "content": SYSTEM_INSTRUCTION}]
    for item in (history or [])[-6:]:
        role = item.get("role")
        text = item.get("content")
        if role in ("user", "assistant") and isinstance(text, str) and text.strip():
            messages.append({"role": role, "content": text[:800]})
    messages.append({"role": "user", "content": task})

    body = {
        "model": PLANNING_MODEL,
        "messages": messages,
        "max_tokens": MAX_OUTPUT_TOKENS,
        "temperature": 0.2,
    }

    async def send(active_client: httpx.AsyncClient) -> str:
        started = time.monotonic()
        try:
            response = await active_client.post(
                OPENROUTER_ENDPOINT,
                json=body,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "X-OpenRouter-Title": "KERO",
                },
            )
            response.raise_for_status()
            data = response.json()
            returned_model = data.get("model")
            if returned_model and returned_model != PLANNING_MODEL:
                raise PlannerReplyError("Beklenmeyen planlama modeli yanıt verdi.")
            result = parse_planner_reply(data)
            logger.info(
                "kero_planner status=success elapsed_ms=%d model=nemotron-free",
                round((time.monotonic() - started) * 1000),
            )
            return result
        except (httpx.HTTPError, ValueError):
            logger.warning(
                "kero_planner status=error elapsed_ms=%d model=nemotron-free",
                round((time.monotonic() - started) * 1000),
            )
            raise

    if client is not None:
        return await send(client)
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as created_client:
        return await send(created_client)
