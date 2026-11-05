import os
import time

from openai import OpenAI

MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
# Pilot embedding besar: dihitung berdampingan agar bisa dibandingkan tanpa
# menimpa vektor lama (rollback = cukup matikan pemakaiannya di backend).
MODEL_BESAR = os.environ.get("EMBEDDING_MODEL_BESAR", "text-embedding-3-large")
BATCH = 64
MAX_RETRIES = 3
RETRY_DELAY_SEC = 5
DIMENSIONS = 1536
DIM_BESAR = 3072


def _require_zdr_base_url() -> str:
    """Base URL wajib OpenRouter agar jalur ZDR (zero data retention) berlaku."""
    base_url = os.environ.get("OPENAI_BASE_URL")
    if base_url != "https://openrouter.ai/api/v1":
        raise ValueError("OPENAI_BASE_URL must be https://openrouter.ai/api/v1 for ZDR")
    return base_url


def _qualified(model: str) -> str:
    # OpenRouter's catalog uses the qualified ID for the same semantic model.
    if model.startswith("openai/"):
        return model
    return f"openai/{model}"


def _embed_batch(client: OpenAI, model: str, batch: list[str], dims: int = DIMENSIONS) -> list[list[float]]:
    """Satu batch dengan retry bertingkat; error provider tidak pernah dilog (bisa memuat teks dokumen)."""
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = client.embeddings.create(
                model=model,
                input=batch,
                dimensions=dims,
                extra_body={"provider": {"zdr": True, "data_collection": "deny"}},
            )
            vectors = [d.embedding for d in resp.data]
            if len(vectors) != len(batch) or any(len(v) != dims for v in vectors):
                raise ValueError("Invalid embedding response count or dimensions")
            return vectors
        except Exception as e:
            last_err = e
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY_SEC * attempt)  # 5s, 10s, 15s
    raise last_err if last_err is not None else RuntimeError("embedding gagal tanpa error tercatat")


def embed_texts(texts: list[str], besar: bool = False) -> list[list[float]]:
    # Timeout kecil dipertahankan (kontrak tes privacy); model besar butuh lebih lama.
    client = OpenAI(base_url=_require_zdr_base_url(), max_retries=0, timeout=120.0 if besar else 60.0)
    model = _qualified(MODEL_BESAR if besar else MODEL)
    dims = DIM_BESAR if besar else DIMENSIONS
    out: list[list[float]] = []
    for i in range(0, len(texts), BATCH):
        out.extend(_embed_batch(client, model, texts[i : i + BATCH], dims))
    return out
