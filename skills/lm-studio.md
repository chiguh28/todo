# Skill: LM Studio ローカルLLM連携

## 概要
LM Studio のOpenAI互換APIを使ったローカルLLM連携パターン。
コスト0・プライバシー安全・オフライン動作が特長。

---

## 前提条件

1. LM Studio を起動してモデルをロード済みであること
2. Local Server を起動（デフォルト: `http://localhost:1234`）
3. `.env` に `LMSTUDIO_BASE_URL=http://localhost:1234/v1` を設定

---

## 基本セットアップ

```python
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


def get_lmstudio_client() -> OpenAI:
    """LM Studio接続クライアントを返す。

    Returns:
        OpenAI互換クライアント（LM Studio向け設定済み）。
    """
    return OpenAI(
        base_url=os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234/v1"),
        api_key="lm-studio",  # LM Studioはキー不要（ダミー）
    )
```

---

## チャット補完パターン

```python
from openai import OpenAI
from typing import Optional


def chat_completion(
    prompt: str,
    system_prompt: str = "You are a helpful assistant.",
    model: str = "local-model",  # LM Studioでロードしたモデル名
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> Optional[str]:
    """LM StudioでLLMに問い合わせる。

    Args:
        prompt: ユーザープロンプト。
        system_prompt: システムプロンプト。
        model: モデル名（LM Studioの表示名）。
        temperature: 生成の多様性（0.0〜1.0）。
        max_tokens: 最大トークン数。

    Returns:
        LLMの応答テキスト。失敗時はNone。
    """
    client = get_lmstudio_client()
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content
    except Exception as e:
        logging.error(f"LM Studio API error: {e}")
        return None
```

---

## ストリーミング出力パターン

```python
from collections.abc import Generator


def chat_stream(
    prompt: str,
    system_prompt: str = "You are a helpful assistant.",
) -> Generator[str, None, None]:
    """ストリーミングでLLM応答を取得する。

    Args:
        prompt: ユーザープロンプト。
        system_prompt: システムプロンプト。

    Yields:
        応答テキストのチャンク。
    """
    client = get_lmstudio_client()
    stream = client.chat.completions.create(
        model="local-model",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
```

---

## JSON構造化出力パターン

```python
import json
from pydantic import BaseModel


class ExtractedData(BaseModel):
    title: str
    summary: str
    tags: list[str]


def extract_structured(text: str) -> Optional[ExtractedData]:
    """テキストから構造化データを抽出する。

    Args:
        text: 解析対象テキスト。

    Returns:
        抽出されたデータ。失敗時はNone。
    """
    system = """以下のJSONフォーマットのみで回答してください。他のテキストは一切含めないこと。
    {"title": "...", "summary": "...", "tags": ["...", "..."]}"""

    response = chat_completion(text, system_prompt=system, temperature=0.1)
    if not response:
        return None
    try:
        data = json.loads(response)
        return ExtractedData(**data)
    except (json.JSONDecodeError, ValueError) as e:
        logging.error(f"JSON parse error: {e}")
        return None
```

---

## .env.example
```bash
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=local-model
```

## セットアップコマンド
```bash
uv add openai python-dotenv pydantic
```
