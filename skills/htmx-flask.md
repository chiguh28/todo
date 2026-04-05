# Skill: HTMX + Flask — シンプルWebアプリ

## 概要
Jinja2テンプレート + HTMX属性でJSをほぼ書かずに動的Webアプリを作る構成。
スクレイピングツールのGUI、管理画面、CRUD系ツールに最適。

---

## セットアップ

```bash
uv add flask python-dotenv
uv add --dev ruff pytest
```

**pyproject.toml**:
```toml
[tool.uv.scripts]
dev = "flask --app src/app run --debug --port 5000"
```

**ディレクトリ構成**:
```
my-app/
├── src/
│   ├── app.py
│   ├── routes/
│   │   └── items.py
│   └── services/
│       └── item_service.py
├── templates/
│   ├── base.html
│   ├── index.html
│   └── partials/        # HTMXが差し替えるHTMLの断片
│       ├── item_list.html
│       └── item_row.html
├── static/
│   └── css/
│       └── style.css
├── pyproject.toml
└── .env.example
```

---

## Flask アプリ本体

### app.py

```python
from flask import Flask
from src.routes.items import items_bp
import os
from dotenv import load_dotenv

load_dotenv()


def create_app() -> Flask:
    """Flaskアプリファクトリ。"""
    app = Flask(
        __name__,
        template_folder="../templates",
        static_folder="../static",
    )
    app.secret_key = os.getenv("SECRET_KEY", "dev-secret")
    app.register_blueprint(items_bp)
    return app


app = create_app()
```

### routes/items.py

```python
from flask import Blueprint, render_template, request, Response
from src.services.item_service import ItemService

items_bp = Blueprint("items", __name__)
service = ItemService()


@items_bp.route("/")
def index() -> str:
    """トップページ。"""
    items = service.get_all()
    return render_template("index.html", items=items)


# HTMX用エンドポイント：HTMLの断片を返す
@items_bp.route("/items", methods=["POST"])
def create_item() -> str:
    """アイテム作成（HTMXからPOST）。HTMLの断片を返す。"""
    name = request.form.get("name", "").strip()
    if not name:
        return "<p class='error'>名前を入力してください</p>", 400

    item = service.create(name)
    return render_template("partials/item_row.html", item=item)


@items_bp.route("/items/<int:item_id>", methods=["DELETE"])
def delete_item(item_id: int) -> Response:
    """アイテム削除（HTMXからDELETE）。空レスポンスで行を消す。"""
    service.delete(item_id)
    return "", 200


@items_bp.route("/items/search")
def search_items() -> str:
    """検索（HTMX + hx-trigger="keyup changed delay:300ms"）。"""
    query = request.args.get("q", "")
    items = service.search(query)
    return render_template("partials/item_list.html", items=items)
```

---

## テンプレート

### templates/base.html

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{% block title %}My App{% endblock %}</title>
  <!-- Tailwind CSS (CDN) -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- HTMX -->
  <script src="https://unpkg.com/htmx.org@2.0.0"></script>
</head>
<body class="bg-gray-50 text-gray-900">
  <div class="max-w-2xl mx-auto px-4 py-8">
    {% block content %}{% endblock %}
  </div>
</body>
</html>
```

### templates/index.html

```html
{% extends "base.html" %}
{% block content %}

<h1 class="text-2xl font-medium mb-6">アイテム管理</h1>

<!-- 追加フォーム（HTMXでPOST → 成功したらリストに行を追加） -->
<form
  hx-post="/items"
  hx-target="#item-list"
  hx-swap="afterbegin"
  class="flex gap-2 mb-6"
>
  <input
    name="name"
    type="text"
    placeholder="アイテム名"
    class="border rounded px-3 py-2 flex-1"
    required
  >
  <button
    type="submit"
    class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
  >
    追加
  </button>
</form>

<!-- 検索（タイプ停止300ms後にGET → リストを丸ごと差し替え） -->
<input
  type="search"
  name="q"
  placeholder="検索..."
  hx-get="/items/search"
  hx-trigger="keyup changed delay:300ms"
  hx-target="#item-list"
  hx-swap="innerHTML"
  class="border rounded px-3 py-2 w-full mb-4"
>

<!-- アイテムリスト -->
<ul id="item-list" class="space-y-2">
  {% include "partials/item_list.html" %}
</ul>

{% endblock %}
```

### templates/partials/item_list.html

```html
{% for item in items %}
  {% include "partials/item_row.html" %}
{% else %}
  <li class="text-gray-400 text-sm">アイテムがありません</li>
{% endfor %}
```

### templates/partials/item_row.html

```html
<li
  id="item-{{ item.id }}"
  class="flex justify-between items-center border rounded px-4 py-3 bg-white"
>
  <span>{{ item.name }}</span>
  <button
    hx-delete="/items/{{ item.id }}"
    hx-target="#item-{{ item.id }}"
    hx-swap="outerHTML swap:300ms"
    hx-confirm="削除しますか？"
    class="text-red-500 text-sm hover:text-red-700"
  >
    削除
  </button>
</li>
```

---

## HTMXの主要属性早見表

| 属性 | 説明 | 例 |
|---|---|---|
| `hx-get` | GETリクエスト | `hx-get="/search"` |
| `hx-post` | POSTリクエスト | `hx-post="/items"` |
| `hx-delete` | DELETEリクエスト | `hx-delete="/items/1"` |
| `hx-target` | 結果を挿入する要素 | `hx-target="#list"` |
| `hx-swap` | 挿入方法 | `innerHTML` / `outerHTML` / `afterbegin` / `beforeend` |
| `hx-trigger` | 発火タイミング | `keyup changed delay:300ms` / `click` / `load` |
| `hx-confirm` | 確認ダイアログ | `hx-confirm="削除しますか？"` |
| `hx-indicator` | ローディング表示 | `hx-indicator="#spinner"` |

---

## ローディング表示パターン

```html
<!-- ボタン押下中にスピナー表示 -->
<button
  hx-post="/run"
  hx-target="#result"
  hx-indicator="#spinner"
  class="bg-blue-600 text-white px-4 py-2 rounded"
>
  実行
  <span id="spinner" class="htmx-indicator ml-2">処理中...</span>
</button>

<div id="result"></div>

<style>
  .htmx-indicator { display: none; }
  .htmx-request .htmx-indicator { display: inline; }
</style>
```

---

## 長時間処理（Server-Sent Events）

```python
# routes/tasks.py
from flask import Response, stream_with_context
import time


@items_bp.route("/run-task")
def run_task() -> Response:
    """SSEで進捗を逐次送信する。"""
    def generate():
        for i in range(10):
            time.sleep(0.5)
            yield f"data: {i + 1}/10 完了\n\n"
        yield "data: <strong>処理完了！</strong>\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )
```

```html
<!-- テンプレート側 -->
<button hx-get="/run-task" hx-swap="innerHTML" hx-target="#progress">
  実行
</button>
<div id="progress" hx-ext="sse" sse-connect="/run-task" sse-swap="message"></div>
```

---

## テスト

```python
# tests/test_routes.py
import pytest
from src.app import create_app


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_index(client):
    response = client.get("/")
    assert response.status_code == 200


def test_create_item(client):
    response = client.post("/items", data={"name": "テスト"})
    assert response.status_code == 200
    assert "テスト" in response.data.decode()


def test_create_item_empty_name(client):
    response = client.post("/items", data={"name": ""})
    assert response.status_code == 400
```

---

## 起動コマンド

```bash
uv run dev
# → http://localhost:5000
```

## セットアップコマンドまとめ

```bash
uv add flask python-dotenv
uv add --dev ruff pytest
```
