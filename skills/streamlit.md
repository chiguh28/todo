# Skill: Streamlit — AIツール・データ可視化UI

## 概要
Pure Python でWebアプリが作れるフレームワーク。
LM Studio連携チャット、スクレイピング結果の確認画面、データ可視化ツールに最適。

---

## セットアップ

```bash
uv add streamlit
uv add --dev ruff pytest
```

**pyproject.toml**:
```toml
[tool.uv.scripts]
dev = "streamlit run src/app.py"
```

**ディレクトリ構成**:
```
my-tool/
├── src/
│   ├── app.py          # メインエントリーポイント
│   ├── pages/          # マルチページ（任意）
│   │   ├── 1_設定.py
│   │   └── 2_履歴.py
│   └── components/     # 再利用UIパーツ（関数）
├── pyproject.toml
└── .env.example
```

---

## 基本パターン

### シンプルなアプリ（app.py）

```python
import streamlit as st
from dotenv import load_dotenv

load_dotenv()

st.set_page_config(
    page_title="My Tool",
    page_icon="⚡",
    layout="wide",
)

st.title("My Tool")

# サイドバー設定
with st.sidebar:
    st.header("設定")
    model = st.selectbox("モデル", ["local-model", "gpt-4o"])
    temperature = st.slider("Temperature", 0.0, 1.0, 0.7, 0.1)

# メインコンテンツ
user_input = st.text_area("入力", height=100)

if st.button("実行", type="primary"):
    with st.spinner("処理中..."):
        result = run_task(user_input)
    st.success("完了")
    st.write(result)
```

---

## LM Studio連携チャットUI

```python
import streamlit as st
from openai import OpenAI
import os

client = OpenAI(
    base_url=os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234/v1"),
    api_key="lm-studio",
)

st.title("LM Studio Chat")

# チャット履歴をsession_stateで管理
if "messages" not in st.session_state:
    st.session_state.messages = []

# 過去メッセージを表示
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.write(msg["content"])

# 入力
if prompt := st.chat_input("メッセージを入力..."):
    st.session_state.messages.append({"role": "user", "content": prompt})

    with st.chat_message("user"):
        st.write(prompt)

    # ストリーミング応答
    with st.chat_message("assistant"):
        response_text = ""
        placeholder = st.empty()

        stream = client.chat.completions.create(
            model="local-model",
            messages=st.session_state.messages,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            response_text += delta
            placeholder.write(response_text)

    st.session_state.messages.append(
        {"role": "assistant", "content": response_text}
    )
```

---

## スクレイピング結果の表示UI

```python
import streamlit as st
import pandas as pd
from src.scraper import scrape_listings

st.title("スクレイピングツール")

url = st.text_input("対象URL")
max_pages = st.number_input("最大ページ数", 1, 20, 5)

if st.button("スクレイピング開始", type="primary"):
    progress = st.progress(0, text="取得中...")
    results = []

    for i, page_data in enumerate(scrape_listings(url, max_pages)):
        results.extend(page_data)
        progress.progress((i + 1) / max_pages, text=f"ページ {i+1}/{max_pages}")

    st.success(f"{len(results)}件取得完了")
    df = pd.DataFrame(results)
    st.dataframe(df, use_container_width=True)

    # CSVダウンロード
    csv = df.to_csv(index=False, encoding="utf-8-sig")
    st.download_button(
        "CSVダウンロード",
        data=csv,
        file_name="results.csv",
        mime="text/csv",
    )
```

---

## session_state でフォーム状態管理

```python
import streamlit as st

# 初期化
if "step" not in st.session_state:
    st.session_state.step = 1
if "data" not in st.session_state:
    st.session_state.data = {}

# ステップ表示
st.progress(st.session_state.step / 3)

if st.session_state.step == 1:
    st.subheader("STEP 1: 基本情報")
    name = st.text_input("名前")
    if st.button("次へ") and name:
        st.session_state.data["name"] = name
        st.session_state.step = 2
        st.rerun()

elif st.session_state.step == 2:
    st.subheader("STEP 2: 設定")
    mode = st.radio("モード", ["通常", "高精度"])
    col1, col2 = st.columns(2)
    with col1:
        if st.button("戻る"):
            st.session_state.step = 1
            st.rerun()
    with col2:
        if st.button("次へ", type="primary"):
            st.session_state.data["mode"] = mode
            st.session_state.step = 3
            st.rerun()

elif st.session_state.step == 3:
    st.subheader("確認")
    st.json(st.session_state.data)
    if st.button("実行", type="primary"):
        run_process(st.session_state.data)
```

---

## キャッシュ（重い処理の高速化）

```python
import streamlit as st

# セッションをまたいでキャッシュ（モデルロード等）
@st.cache_resource
def load_model():
    from openai import OpenAI
    return OpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")

# 同じ引数なら再計算しない（スクレイピング結果等）
@st.cache_data(ttl=300)  # 5分でキャッシュ切れ
def fetch_data(url: str) -> list[dict]:
    return scrape(url)

client = load_model()  # 初回のみ実行
```

---

## マルチページ構成

```
src/
├── app.py          # ホーム（st.Page で定義）
└── pages/
    ├── chat.py     # チャット画面
    ├── scraper.py  # スクレイピング
    └── history.py  # 履歴
```

```python
# app.py
import streamlit as st

pg = st.navigation([
    st.Page("pages/chat.py",    title="チャット",         icon="💬"),
    st.Page("pages/scraper.py", title="スクレイピング",   icon="🔍"),
    st.Page("pages/history.py", title="履歴",             icon="📋"),
])
pg.run()
```

---

## 起動コマンド

```bash
# 開発
uv run dev
# → http://localhost:8501

# ポート指定
uv run streamlit run src/app.py --server.port 8080
```

## セットアップコマンドまとめ

```bash
uv add streamlit pandas python-dotenv openai
uv add --dev ruff pytest
```
