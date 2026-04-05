# Skill: Python Webスクレイピング

## 概要
Playwright と BeautifulSoup4 を使ったWebスクレイピングのベストプラクティス。

---

## Playwright（JS描画・動的サイト向け）

### 基本セットアップ
```python
from playwright.async_api import async_playwright, Page
import asyncio
from typing import AsyncGenerator
from contextlib import asynccontextmanager


@asynccontextmanager
async def get_browser() -> AsyncGenerator:
    """ブラウザコンテキストを管理するコンテキストマネージャ。"""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        try:
            yield context
        finally:
            await browser.close()
```

### スクレイピングパターン
```python
async def scrape_page(url: str) -> str:
    """ページのHTMLを取得する。

    Args:
        url: スクレイピング対象のURL。

    Returns:
        ページのHTML文字列。
    """
    async with get_browser() as context:
        page: Page = await context.new_page()
        await page.goto(url, wait_until="networkidle", timeout=30000)
        return await page.content()
```

### レート制限・礼儀正しいスクレイピング
```python
import asyncio
import random

async def polite_scrape(urls: list[str]) -> list[str]:
    """礼儀正しく複数URLをスクレイピング。"""
    results: list[str] = []
    for url in urls:
        html = await scrape_page(url)
        results.append(html)
        # ランダムウェイトで負荷を分散
        await asyncio.sleep(random.uniform(1.5, 3.0))
    return results
```

---

## BeautifulSoup4（静的HTML解析向け）

### 基本パターン
```python
from bs4 import BeautifulSoup
import requests
from typing import Optional


def fetch_html(url: str, timeout: int = 15) -> Optional[str]:
    """HTTPSでHTMLを取得する。

    Args:
        url: 対象URL。
        timeout: タイムアウト秒数。

    Returns:
        HTML文字列。取得失敗時はNone。
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    try:
        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        logging.error(f"Fetch failed: {url} — {e}")
        return None


def parse_html(html: str) -> BeautifulSoup:
    """HTMLをBeautifulSoupでパースする。"""
    return BeautifulSoup(html, "html.parser")
```

---

## エラーハンドリング

```python
from playwright.async_api import TimeoutError as PlaywrightTimeout

async def safe_scrape(url: str) -> Optional[str]:
    """エラーハンドリング付きスクレイピング。"""
    try:
        return await scrape_page(url)
    except PlaywrightTimeout:
        logging.warning(f"Timeout: {url}")
        return None
    except Exception as e:
        logging.error(f"Unexpected error scraping {url}: {e}")
        return None
```

---

## pyproject.toml 依存関係
```toml
[project]
dependencies = [
    "playwright>=1.40.0",
    "beautifulsoup4>=4.12.0",
    "requests>=2.31.0",
    "lxml>=5.0.0",
]

[tool.uv.scripts]
install-browsers = "playwright install chromium"
```

## セットアップコマンド
```bash
uv add playwright beautifulsoup4 requests lxml
uv run playwright install chromium
```
