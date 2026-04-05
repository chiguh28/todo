# DEV_WORKFLOW.md — 開発ワークフロー & ベストプラクティス

## 概要

このドキュメントは全プロジェクト共通の開発ルールを定義する。
Claude Codeはこのファイルを参照して作業を進めること。

---

## 1. ブランチ戦略

```
main
 └── feat/<issue番号>-<機能名>    # 機能開発
 └── fix/<issue番号>-<バグ概要>   # バグ修正
 └── chore/<作業名>              # 設定・環境変更
```

**ルール**:
- `main` への直接プッシュ禁止
- すべての変更は PR 経由でマージ
- PR マージ後はブランチを削除（`--delete-branch`）
- Squash マージを使う（コミット履歴をシンプルに保つ）

---

## 2. コミットメッセージ規約（Conventional Commits）

```
<type>(<scope>): <summary>

[optional body]

[optional footer: Closes #<issue番号>]
```

**例**:
```
feat(scraper): implement page fetching with retry logic

Add exponential backoff for network failures.
Max 3 retries with 1s, 2s, 4s delays.

Closes #3
```

**タイプ一覧**:
| タイプ | 用途 | バージョン影響 |
|---|---|---|
| `feat` | 新機能 | MINOR |
| `fix` | バグ修正 | PATCH |
| `test` | テスト追加・修正 | なし |
| `refactor` | リファクタリング | なし |
| `chore` | ビルド・設定 | なし |
| `docs` | ドキュメント | なし |
| `perf` | パフォーマンス改善 | PATCH |
| `ci` | CI/CD変更 | なし |

---

## 3. TDD ワークフロー

```
RED → GREEN → REFACTOR
```

### 手順

```bash
# 1. テストを書く（実装なし → FAILすること）
uv run pytest tests/test_<module>.py -v
# → FAILED が出ればOK

# 2. 最小限の実装を書く（テストを通す）
uv run pytest tests/test_<module>.py -v
# → PASSED が出ればOK

# 3. リファクタリング（テストが通ったまま整理）
uv run ruff check . --fix && uv run ruff format .
uv run pytest
# → 全テストPASSEDを確認
```

### テストの書き方

```python
# ✅ Good: AAA パターン
def test_fetch_page_success():
    """正常なURLのHTMLが取得できること。"""
    # Arrange（準備）
    url = "https://example.com"
    
    # Act（実行）
    result = fetch_page(url)
    
    # Assert（検証）
    assert result is not None
    assert "<html" in result


# ✅ Good: 異常系も書く
def test_fetch_page_timeout():
    """タイムアウト時にNoneを返すこと。"""
    with pytest.raises(TimeoutError):
        fetch_page("https://invalid.example.com", timeout=0.001)


# ❌ Bad: Assertがない
def test_fetch_page():
    result = fetch_page("https://example.com")
    # assert がない → テストの意味なし
```

### カバレッジ確認

```bash
uv add --dev pytest-cov
uv run pytest --cov=src --cov-report=term-missing
# 目標: 80%以上
```

---

## 4. Issue 管理

### Issueの粒度

1 Issue = 1 PR = 1機能 が基本。
大きすぎる機能は分割すること（目安: 1 Issue = 1〜3日の作業量）。

### Issueのラベル

| ラベル | 説明 |
|---|---|
| `enhancement` | 新機能 |
| `bug` | バグ |
| `priority: high` | 優先度高 |
| `priority: medium` | 優先度中 |
| `priority: low` | 優先度低 |
| `blocked` | 他のIssueが完了するまで着手不可 |

### Issueの進め方

```bash
# Issue確認
gh issue list

# 着手するIssueを選んでブランチ作成
gh issue view <番号>
git checkout -b feat/<番号>-<機能名>

# 実装完了後にPR作成（Closes #<番号> で自動クローズ）
gh pr create --title "feat: <機能名>" --body "Closes #<番号>"
gh pr merge --squash --delete-branch
```

---

## 5. GitHub Actions（CI）

`.github/workflows/ci.yml` を必ず作成する:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v3

      - name: Set up Python
        run: uv python install

      - name: Install dependencies
        run: uv sync --all-extras

      - name: Lint with ruff
        run: |
          uv run ruff check .
          uv run ruff format --check .

      - name: Test with pytest
        run: uv run pytest --cov=src --cov-report=term-missing
```

---

## 6. セキュリティルール

- `.env` はコミット禁止（`.gitignore` に追加必須）
- `.env.example` は必ずコミット（キー名だけ、値なし）
- APIキー・パスワードはコードにハードコード禁止
- `git log` でシークレットが混入していないか定期確認

```bash
# .gitignoreの最低限の内容
.env
.env.local
__pycache__/
*.pyc
.pytest_cache/
.ruff_cache/
dist/
*.egg-info/
```

---

## 7. ロギングルール

```python
# ✅ Good
import logging

logger = logging.getLogger(__name__)

def fetch_data(url: str) -> str:
    logger.info(f"Fetching: {url}")
    try:
        ...
        logger.debug(f"Success: {url}")
    except Exception as e:
        logger.error(f"Failed to fetch {url}: {e}")
        raise

# ❌ Bad
print(f"Fetching: {url}")  # print禁止
```

---

## 8. ベストプラクティスまとめ

| カテゴリ | ルール |
|---|---|
| パッケージ管理 | `uv` のみ使う（pip直打ち禁止） |
| コード品質 | 型ヒント必須、ruff必須、docstring必須 |
| テスト | TDD（RED→GREEN→REFACTOR）、カバレッジ80%目標 |
| Git | Conventional Commits、PR経由マージのみ |
| タスク管理 | Issue駆動（1機能=1Issue） |
| セキュリティ | `.env` でシークレット管理、コミット禁止 |
| ロギング | `logging` モジュールのみ（print禁止） |
| CI | GitHub Actions で lint + test を自動実行 |
