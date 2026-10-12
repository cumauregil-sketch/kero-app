"""Free-only OpenRouter planning specialist; this module never runs tools or changes files."""

import httpx

# Pin the free variant so no paid OpenRouter model can be selected by request data.
PLANNING_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_INSTRUCTION = (
    "Sen KERO'nun planlama ve akıl yürütme uzmanısın. Türkçe, uygulanabilir ve "
    "mantıklı bir eylem planı hazırla. Gerekli adımları, bağımlılıkları, "
    "olası engelleri ve doğrulama ölçütlerini açıkla. İstenen işlem dış "
    "sistemleri, dosyaları veya hesapları değiştiriyorsa bunları yalnızca "
    "öneri olarak yaz; yapıldığını asla iddia etme. Bu çağrıda araçlara "
    "erişimin yoktur. Bilinmeyen bilgiyi uydurma."
)


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
    return result


async def create_plan(
    task: str,
    *,
    api_key: str,
    client: httpx.AsyncClient | None = None,
) -> str:
    """Obtain a text-only planning suggestion from the *free* Ling model."""
    body = {
        "model": PLANNING_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_INSTRUCTION},
            {"role": "user", "content": task},
        ],
        "max_tokens": 1200,
        "temperature": 0.2,
    }

    async def send(active_client: httpx.AsyncClient) -> str:
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
        return parse_planner_reply(response.json())

    if client is not None:
        return await send(client)
    async with httpx.AsyncClient(timeout=65) as created_client:
        return await send(created_client)
