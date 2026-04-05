# Skill: WebSocket — リアルタイム通信

## 概要
FastAPI（バックエンド）と React（フロントエンド）間のリアルタイム双方向通信パターン。
チャットUI、進捗通知、自動化ツールのライブログ表示に使う。

---

## セットアップ

```bash
# バックエンド（追加パッケージなし、FastAPIに組み込み済み）
uv add fastapi "uvicorn[standard]"

# フロントエンド（追加パッケージなし、ブラウザ標準WebSocket API使用）
# 複雑な状態管理が必要な場合のみ追加
npm install @tanstack/react-query
```

---

## FastAPI バックエンド

### シンプルなWebSocket（1対1）

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import asyncio
import logging

app = FastAPI()
logger = logging.getLogger(__name__)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """クライアントと1対1でリアルタイム通信する。"""
    await websocket.accept()
    logger.info("WebSocket connected")

    try:
        while True:
            # クライアントからメッセージを受信
            data = await websocket.receive_text()
            logger.info(f"Received: {data}")

            # 処理して返す
            result = await process(data)
            await websocket.send_text(result)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
```

### 複数クライアント管理（ブロードキャスト）

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Any
import json

app = FastAPI()


class ConnectionManager:
    """WebSocket接続を一元管理するクラス。"""

    def __init__(self) -> None:
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.active.remove(ws)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """全クライアントにJSONを送信する。"""
        text = json.dumps(message, ensure_ascii=False)
        for ws in self.active:
            await ws.send_text(text)

    async def send_to(self, ws: WebSocket, message: dict[str, Any]) -> None:
        """特定クライアントにJSONを送信する。"""
        await ws.send_text(json.dumps(message, ensure_ascii=False))


manager = ConnectionManager()


@app.websocket("/ws/chat")
async def chat(websocket: WebSocket) -> None:
    """チャットルーム：全員にブロードキャスト。"""
    await manager.connect(websocket)
    await manager.broadcast({"type": "system", "text": "ユーザーが参加しました"})

    try:
        while True:
            data = await websocket.receive_json()
            await manager.broadcast({"type": "message", "text": data["text"]})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast({"type": "system", "text": "ユーザーが退出しました"})
```

### 自動化ツールのログをリアルタイム送信

```python
import asyncio


@app.websocket("/ws/task/{task_id}")
async def task_progress(websocket: WebSocket, task_id: str) -> None:
    """タスクの進捗をリアルタイムで送信する。"""
    await websocket.accept()

    try:
        # タスクを非同期で実行しながら進捗を送る
        async for progress in run_automation_task(task_id):
            await websocket.send_json({
                "type": "progress",
                "step": progress.step,
                "total": progress.total,
                "message": progress.message,
            })

        await websocket.send_json({"type": "complete", "message": "完了"})

    except WebSocketDisconnect:
        # クライアントが切断したらタスクも止める
        await cancel_task(task_id)
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
```

---

## React フロントエンド

### カスタムフック（useWebSocket.ts）

```typescript
import { useEffect, useRef, useState, useCallback } from "react";

type WsStatus = "connecting" | "open" | "closed" | "error";

interface UseWebSocketReturn {
  status: WsStatus;
  lastMessage: string | null;
  send: (data: string | object) => void;
  close: () => void;
}

export function useWebSocket(url: string): UseWebSocketReturn {
  const ws = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<WsStatus>("connecting");
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  useEffect(() => {
    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onopen = () => setStatus("open");
    socket.onclose = () => setStatus("closed");
    socket.onerror = () => setStatus("error");
    socket.onmessage = (e) => setLastMessage(e.data);

    return () => socket.close();
  }, [url]);

  const send = useCallback((data: string | object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const payload = typeof data === "string" ? data : JSON.stringify(data);
      ws.current.send(payload);
    }
  }, []);

  const close = useCallback(() => ws.current?.close(), []);

  return { status, lastMessage, send, close };
}
```

### チャットUI（Chat.tsx）

```typescript
import { useEffect, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";

interface Message {
  type: "message" | "system";
  text: string;
}

export function Chat() {
  const { status, lastMessage, send } = useWebSocket(
    "ws://localhost:8000/ws/chat"
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  // メッセージ受信時にリストへ追加
  useEffect(() => {
    if (!lastMessage) return;
    try {
      const msg: Message = JSON.parse(lastMessage);
      setMessages((prev) => [...prev, msg]);
    } catch {}
  }, [lastMessage]);

  const handleSend = () => {
    if (!input.trim()) return;
    send({ text: input });
    setInput("");
  };

  return (
    <div className="flex flex-col h-[500px]">
      {/* 接続状態バッジ */}
      <div className="text-xs text-gray-500 mb-2">
        状態: {status === "open" ? "🟢 接続中" : "🔴 切断"}
      </div>

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto space-y-2 border rounded p-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.type === "system" ? "text-gray-400 text-xs" : ""}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* 入力欄 */}
      <div className="flex gap-2 mt-3">
        <input
          className="border rounded px-3 py-2 flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={status !== "open"}
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          onClick={handleSend}
          disabled={status !== "open"}
        >
          送信
        </button>
      </div>
    </div>
  );
}
```

### タスク進捗UI（TaskProgress.tsx）

```typescript
import { useEffect, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";

interface Progress {
  type: "progress" | "complete" | "error";
  step?: number;
  total?: number;
  message: string;
}

export function TaskProgress({ taskId }: { taskId: string }) {
  const { lastMessage } = useWebSocket(
    `ws://localhost:8000/ws/task/${taskId}`
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!lastMessage) return;
    const data: Progress = JSON.parse(lastMessage);

    setLogs((prev) => [...prev, data.message]);

    if (data.type === "progress" && data.step && data.total) {
      setProgress(Math.round((data.step / data.total) * 100));
    }
    if (data.type === "complete" || data.type === "error") {
      setDone(true);
    }
  }, [lastMessage]);

  return (
    <div>
      {/* プログレスバー */}
      <div className="w-full bg-gray-200 rounded h-2 mb-3">
        <div
          className="bg-blue-600 h-2 rounded transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ログ */}
      <div className="bg-gray-900 text-green-400 font-mono text-sm rounded p-3 h-48 overflow-y-auto">
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
        {done && <div className="text-yellow-400 mt-2">▶ 処理完了</div>}
      </div>
    </div>
  );
}
```

---

## LM Studio ストリーミング × WebSocket

```python
from openai import AsyncOpenAI
import os


@app.websocket("/ws/llm")
async def llm_stream(websocket: WebSocket) -> None:
    """LM Studioのストリーミング応答をWebSocketで転送する。"""
    await websocket.accept()
    client = AsyncOpenAI(
        base_url=os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234/v1"),
        api_key="lm-studio",
    )

    try:
        while True:
            prompt = await websocket.receive_text()

            # LM Studioにストリーミングで問い合わせ
            stream = await client.chat.completions.create(
                model="local-model",
                messages=[{"role": "user", "content": prompt}],
                stream=True,
            )

            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    await websocket.send_json({
                        "type": "chunk",
                        "text": delta,
                    })

            await websocket.send_json({"type": "done"})

    except WebSocketDisconnect:
        pass
```

---

## 接続確認（ヘルスチェック用ping-pong）

```python
@app.websocket("/ws")
async def websocket_with_ping(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            try:
                # 30秒タイムアウトで受信待ち
                data = await asyncio.wait_for(
                    websocket.receive_text(), timeout=30.0
                )
                if data == "ping":
                    await websocket.send_text("pong")
                else:
                    await websocket.send_text(await process(data))
            except asyncio.TimeoutError:
                # タイムアウト時はpingを送って生存確認
                await websocket.send_text("ping")
    except WebSocketDisconnect:
        pass
```

---

## テスト（pytest + httpx）

```python
import pytest
from httpx import AsyncClient, ASGITransport
from fastapi.testclient import TestClient
from src.api.main import app


def test_websocket_echo():
    """WebSocketの送受信テスト。"""
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.send_text("hello")
            data = ws.receive_text()
            assert data == "hello"  # echoの場合
```

---

## 使い分け早見表

| ケース | 技術 |
|---|---|
| チャット・双方向通信 | WebSocket |
| 進捗通知（一方向） | WebSocket or SSE |
| LM Studio ストリーミング | WebSocket（双方向がおすすめ） |
| Flaskで使いたい | SSE（flask + `stream_with_context`） |
| 複数ユーザー対応 | WebSocket + ConnectionManager |
