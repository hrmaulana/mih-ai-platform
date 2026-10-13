import os
import time

from openai import OpenAI

MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
BATCH = 64
MAX_RETRIES = 3
RETRY_DELAY_SEC = 5


def embed_texts(texts: list[str]) -> list[list[float]]:
    base_url = os.environ.get("OPENAI_BASE_URL")
    if base_url != "https://openrouter.ai/api/v1":
        raise ValueError("OPENAI_BASE_URL must be https://openrouter.ai/api/v1 for ZDR")
    client = OpenAI(base_url=base_url, max_retries=0, timeout=60.0)
    # OpenRouter's catalog uses the qualified ID for the same semantic model.
    model = "openai/text-embedding-3-small" if MODEL == "text-embedding-3-small" else MODEL
    out: list[list[float]] = []
    for i in range(0, len(texts), BATCH):
        batch = texts[i : i + BATCH]
        last_err = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = client.embeddings.create(
                    model=model,
                    input=batch,
                    dimensions=1536,
                    extra_body={"provider": {"zdr": True, "data_collection": "deny"}},
                )
                vectors = [d.embedding for d in resp.data]
                if len(vectors) != len(batch) or any(len(v) != 1536 for v in vectors):
                    raise ValueError("Invalid embedding response count or dimensions")
                out.extend(vectors)
                break
            except Exception as e:
                last_err = e
                if attempt < MAX_RETRIES:
                    wait = RETRY_DELAY_SEC * attempt  # 5s, 10s, 15s
                    # Provider exceptions may echo document text; never log them.
                    time.sleep(wait)
        else:
            raise last_err
    return out
