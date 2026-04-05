# Skill: Flask / FastAPI 開発

## 概要
小〜中規模のPythonバックエンドAPIを素早く作るためのパターン集。
小さいツールはFlask、型安全・ドキュメント重視はFastAPI。

---

## Flask（シンプルツール向け）

### 最小構成
```python
from flask import Flask, jsonify, request
from typing import Any
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)


@app.route("/health", methods=["GET"])
def health() -> tuple[Any, int]:
    """ヘルスチェックエンドポイント。"""
    return jsonify({"status": "ok"}), 200


@app.route("/api/v1/run", methods=["POST"])
def run_task() -> tuple[Any, int]:
    """タスク実行エンドポイント。"""
    data = request.get_json()
    if not data or "input" not in data:
        return jsonify({"error": "input is required"}), 400

    result = process(data["input"])
    return jsonify({"result": result}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
```

### Blueprint構成（中規模向け）
```
src/
├── app.py          # アプリファクトリ
├── routes/
│   ├── __init__.py
│   ├── scrape.py   # /api/scrape/*
│   └── llm.py      # /api/llm/*
└── services/
    ├── scraper.py
    └── llm_client.py
```

```python
# app.py
from flask import Flask
from src.routes.scrape import scrape_bp
from src.routes.llm import llm_bp


def create_app() -> Flask:
    """Flaskアプリファクトリ。"""
    app = Flask(__name__)
    app.register_blueprint(scrape_bp, url_prefix="/api/scrape")
    app.register_blueprint(llm_bp, url_prefix="/api/llm")
    return app
```

---

## FastAPI（型安全・自動ドキュメント向け）

### 最小構成
```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="My API", version="1.0.0")


class ScrapeRequest(BaseModel):
    url: str
    timeout: int = 30


class ScrapeResponse(BaseModel):
    url: str
    content: str
    success: bool


@app.get("/health")
async def health() -> dict[str, str]:
    """ヘルスチェック。"""
    return {"status": "ok"}


@app.post("/api/scrape", response_model=ScrapeResponse)
async def scrape(req: ScrapeRequest) -> ScrapeResponse:
    """URLをスクレイピングする。"""
    try:
        content = await fetch_content(req.url, req.timeout)
        return ScrapeResponse(url=req.url, content=content, success=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
```

---

## 共通パターン

### エラーレスポンス統一
```python
# Flask
from flask import jsonify
from werkzeug.exceptions import HTTPException

@app.errorhandler(Exception)
def handle_error(e: Exception):
    code = e.code if isinstance(e, HTTPException) else 500
    return jsonify({"error": str(e), "code": code}), code
```

### 環境変数ロード
```python
import os
from dotenv import load_dotenv

load_dotenv()

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "5000"))
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
```

---

## pyproject.toml 依存関係

```toml
# Flask用
[project]
dependencies = [
    "flask>=3.0.0",
    "python-dotenv>=1.0.0",
]

# FastAPI用
[project]
dependencies = [
    "fastapi>=0.110.0",
    "uvicorn[standard]>=0.27.0",
    "pydantic>=2.0.0",
    "python-dotenv>=1.0.0",
]
```

## セットアップコマンド
```bash
# Flask
uv add flask python-dotenv

# FastAPI
uv add fastapi "uvicorn[standard]" pydantic python-dotenv
```

## 起動コマンド
```bash
# Flask
uv run python src/app.py

# FastAPI（開発）
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
