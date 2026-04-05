# Skill: React + FastAPI フルスタック構成

## 概要
FastAPI（Python / uv）をバックエンド、React（Vite / TypeScript）をフロントエンドに使う
完全分離構成のベストプラクティス。

---

## ディレクトリ構成

```
my-app/
├── backend/                  # Python (uv管理)
│   ├── src/
│   │   └── api/
│   │       ├── __init__.py
│   │       ├── main.py       # FastAPIアプリ本体
│   │       ├── routes/       # エンドポイント
│   │       ├── models/       # Pydanticモデル
│   │       └── services/     # ビジネスロジック
│   ├── tests/
│   ├── pyproject.toml
│   └── .env.example
├── frontend/                 # TypeScript (npm管理)
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/            # TanStack Query hooks
│   │   ├── lib/              # APIクライアント
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml        # 本番・開発環境
└── CLAUDE.md
```

---

## セットアップ手順

### バックエンド（uv）

```bash
mkdir my-app && cd my-app
mkdir backend frontend

cd backend
uv init --no-workspace
uv add fastapi "uvicorn[standard]" pydantic python-dotenv
uv add --dev ruff pytest pytest-asyncio httpx
```

**pyproject.toml（追記部分）**:
```toml
[tool.uv.scripts]
dev = "uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000"
test = "pytest"
lint = "ruff check . --fix && ruff format ."
```

### フロントエンド（npm / Vite）

```bash
cd ../frontend
npm create vite@latest . -- --template react-ts
npm install

# 主要ライブラリ追加
npm install @tanstack/react-query axios
npm install -D tailwindcss @tailwindcss/vite
```

---

## FastAPI 実装パターン

### main.py

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.routes import items

app = FastAPI(title="My App", version="1.0.0")

# CORS設定（開発時はlocalhost:5173を許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(items.router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

### Pydanticモデル（models/item.py）

```python
from pydantic import BaseModel, Field
from datetime import datetime


class ItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = ""


class ItemResponse(BaseModel):
    id: int
    name: str
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

### ルート（routes/items.py）

```python
from fastapi import APIRouter, HTTPException
from src.api.models.item import ItemCreate, ItemResponse
from src.api.services.item_service import ItemService

router = APIRouter(prefix="/items", tags=["items"])
service = ItemService()


@router.get("/", response_model=list[ItemResponse])
async def list_items() -> list[ItemResponse]:
    """アイテム一覧を返す。"""
    return await service.get_all()


@router.post("/", response_model=ItemResponse, status_code=201)
async def create_item(body: ItemCreate) -> ItemResponse:
    """アイテムを作成する。"""
    return await service.create(body)


@router.delete("/{item_id}", status_code=204)
async def delete_item(item_id: int) -> None:
    """アイテムを削除する。"""
    if not await service.delete(item_id):
        raise HTTPException(status_code=404, detail="Item not found")
```

---

## React 実装パターン

### Vite プロキシ設定（vite.config.ts）

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // /api/* → FastAPI (localhost:8000) に転送
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
```

### APIクライアント（lib/api.ts）

```typescript
import axios from "axios";

export const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

// レスポンス型定義
export interface Item {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface ItemCreate {
  name: string;
  description?: string;
}

// API関数
export const itemsApi = {
  list: () => api.get<Item[]>("/items").then((r) => r.data),
  create: (body: ItemCreate) =>
    api.post<Item>("/items", body).then((r) => r.data),
  delete: (id: number) => api.delete(`/items/${id}`),
};
```

### TanStack Query フック（hooks/useItems.ts）

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { itemsApi, type ItemCreate } from "@/lib/api";

export function useItems() {
  return useQuery({
    queryKey: ["items"],
    queryFn: itemsApi.list,
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ItemCreate) => itemsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => itemsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}
```

### TanStack Query セットアップ（main.tsx）

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
```

### コンポーネント例（App.tsx）

```typescript
import { useItems, useCreateItem, useDeleteItem } from "@/hooks/useItems";
import { useState } from "react";

export default function App() {
  const { data: items, isLoading } = useItems();
  const create = useCreateItem();
  const remove = useDeleteItem();
  const [name, setName] = useState("");

  if (isLoading) return <div className="p-4">読み込み中...</div>;

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-medium mb-4">アイテム一覧</h1>

      <div className="flex gap-2 mb-6">
        <input
          className="border rounded px-3 py-2 flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="アイテム名"
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={() => {
            create.mutate({ name });
            setName("");
          }}
        >
          追加
        </button>
      </div>

      <ul className="space-y-2">
        {items?.map((item) => (
          <li
            key={item.id}
            className="flex justify-between items-center border rounded p-3"
          >
            <span>{item.name}</span>
            <button
              className="text-red-500 text-sm"
              onClick={() => remove.mutate(item.id)}
            >
              削除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 起動コマンド

```bash
# バックエンド（backend/ディレクトリで）
uv run dev
# → http://localhost:8000
# → http://localhost:8000/docs (Swagger UI 自動生成)

# フロントエンド（frontend/ディレクトリで）
npm run dev
# → http://localhost:5173
```

---

## テスト（バックエンド）

```python
# tests/test_items.py
import pytest
from httpx import AsyncClient, ASGITransport
from src.api.main import app


@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_create_item():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/items", json={"name": "テストアイテム"}
        )
    assert response.status_code == 201
    assert response.json()["name"] == "テストアイテム"
```

```bash
uv run pytest -v
```

---

## よくある注意点

- **CORS設定**は開発時と本番で分ける（本番では `allow_origins` を絞る）
- フロントエンドは **Vite のプロキシ**経由でAPIを叩く（`/api/*` → `localhost:8000`）
- FastAPI の **Swagger UI** は `/docs` で自動生成される（開発中は必ず確認）
- `uv run dev` と `npm run dev` の **2つのプロセスを同時起動**する必要がある

## セットアップコマンドまとめ

```bash
# backend
uv add fastapi "uvicorn[standard]" pydantic python-dotenv
uv add --dev ruff pytest pytest-asyncio httpx

# frontend
npm install @tanstack/react-query axios
npm install -D tailwindcss @tailwindcss/vite
```
