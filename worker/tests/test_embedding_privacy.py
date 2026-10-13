"""Offline embedding privacy gates; the SDK is stubbed, never a live provider."""
from types import SimpleNamespace

import pytest
import embedding


# Retain the real function before the suite's autouse no-provider guard patches it.
_embed_texts = embedding.embed_texts


@pytest.fixture
def sdk(monkeypatch):
    state = SimpleNamespace(init=[], calls=[], sleeps=[], error=None, response=None)

    def create(**kwargs):
        state.calls.append(kwargs)
        if state.error is not None:
            raise state.error
        if state.response is not None:
            return state.response
        return SimpleNamespace(data=[
            SimpleNamespace(index=i, embedding=[float(i)] * 1536)
            for i, _ in enumerate(kwargs["input"])
        ])

    def client(**kwargs):
        state.init.append(kwargs)
        return SimpleNamespace(embeddings=SimpleNamespace(create=create))

    monkeypatch.setattr(embedding, "embed_texts", _embed_texts)
    monkeypatch.setattr(embedding, "OpenAI", client)
    monkeypatch.setattr(embedding.time, "sleep", state.sleeps.append)
    monkeypatch.setattr(embedding, "MODEL", "text-embedding-3-small")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://openrouter.ai/api/v1")
    return state


def test_every_batch_requires_zdr_without_changing_embedding_model(sdk):
    texts = [f"synthetic chunk {i}" for i in range(65)]
    vectors = embedding.embed_texts(texts)
    assert embedding.MODEL == "text-embedding-3-small"
    assert len(vectors) == len(texts)
    assert all(len(vector) == 1536 for vector in vectors)
    assert [len(call["input"]) for call in sdk.calls] == [64, 1]
    for call in sdk.calls:
        assert call["model"] == "openai/text-embedding-3-small"
        assert call["dimensions"] == 1536
        assert call["extra_body"] == {"provider": {"zdr": True, "data_collection": "deny"}}
    assert sdk.calls[0]["input"] == texts[:64]
    assert sdk.calls[1]["input"] == texts[64:]
    assert sdk.init == [{"base_url": "https://openrouter.ai/api/v1", "max_retries": 0, "timeout": 60.0}]


@pytest.mark.parametrize("base_url", [None, "", "https://api.openai.com/v1",
                                     "http://openrouter.ai/api/v1",
                                     "https://openrouter.ai/api/v1/",
                                     "https://openrouter.ai/api/v1.evil"])
def test_non_openrouter_base_url_fails_before_sdk_creation(sdk, monkeypatch, base_url):
    if base_url is None:
        monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    else:
        monkeypatch.setenv("OPENAI_BASE_URL", base_url)
    with pytest.raises(ValueError, match="OPENAI_BASE_URL"):
        embedding.embed_texts(["synthetic private chunk"])
    assert sdk.init == []
    assert sdk.calls == []


@pytest.mark.parametrize("count,dimension", [(0, 1536), (2, 1536), (1, 1535), (1, 1537)])
def test_invalid_response_shape_fails_closed(sdk, count, dimension):
    sdk.response = SimpleNamespace(data=[
        SimpleNamespace(index=i, embedding=[0.0] * dimension) for i in range(count)
    ])
    with pytest.raises(ValueError, match="embedding response"):
        embedding.embed_texts(["synthetic chunk"])


def test_provider_failure_does_not_log_document_content(sdk, capsys):
    secret = "synthetic private document content"
    sdk.error = RuntimeError(f"provider error echoed input: {secret}")
    with pytest.raises(RuntimeError):
        embedding.embed_texts([secret])
    captured = capsys.readouterr()
    assert secret not in captured.out + captured.err
    assert len(sdk.calls) == embedding.MAX_RETRIES
    assert sdk.sleeps == [5, 10]
    assert all(call["extra_body"] == {
        "provider": {"zdr": True, "data_collection": "deny"}
    } for call in sdk.calls)
