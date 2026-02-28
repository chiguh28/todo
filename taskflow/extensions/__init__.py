"""拡張機能の発見・登録ロジック"""

import importlib
import os
import sys

from flask import Blueprint

from .base import TaskFlowExtension


def discover_extensions(extensions_dir: str) -> list:
    """
    extensions/ ディレクトリを走査し、有効な拡張機能を返す。

    各サブディレクトリの __init__.py で以下のどちらかを定義する:
      - extension = Extension()  (インスタンス)
      - class Extension(TaskFlowExtension): ...  (クラス)
    """
    found = []
    if not os.path.isdir(extensions_dir):
        return found

    parent = os.path.dirname(extensions_dir)
    if parent not in sys.path:
        sys.path.insert(0, parent)

    for entry in sorted(os.listdir(extensions_dir)):
        ext_path = os.path.join(extensions_dir, entry)
        if not os.path.isdir(ext_path):
            continue
        if not os.path.isfile(os.path.join(ext_path, '__init__.py')):
            continue

        try:
            module = importlib.import_module(f'extensions.{entry}')
        except Exception as e:
            print(f"  [WARN] 拡張機能 '{entry}' の読込失敗: {e}")
            continue

        # extension インスタンスまたは Extension クラスを探す
        ext_instance = getattr(module, 'extension', None)
        if ext_instance is None:
            ext_class = getattr(module, 'Extension', None)
            if ext_class and isinstance(ext_class, type) and issubclass(ext_class, TaskFlowExtension):
                ext_instance = ext_class()

        if not isinstance(ext_instance, TaskFlowExtension):
            print(f"  [WARN] '{entry}': TaskFlowExtension のサブクラスが見つかりません")
            continue
        if not ext_instance.name:
            print(f"  [WARN] '{entry}': name が設定されていません")
            continue

        found.append(ext_instance)
        print(f"  [OK] 拡張機能ロード: {ext_instance.label} (v{ext_instance.version})")

    return found


def register_extensions(app, extensions: list, db_getter) -> None:
    """
    発見した拡張機能をFlaskアプリに登録する。

    登録内容:
      1. init_db() でテーブル作成
      2. get_blueprint() の Blueprint をアプリに登録
      3. static/ フォルダを /extensions/{name}/static/ で配信
    """
    for ext in extensions:
        # テーブル作成
        try:
            ext.init_db(db_getter())
        except Exception as e:
            print(f"  [WARN] '{ext.name}' の DB 初期化失敗: {e}")

        # Blueprint 登録
        bp = ext.get_blueprint()
        if bp is not None:
            try:
                app.register_blueprint(bp)
            except Exception as e:
                print(f"  [WARN] '{ext.name}' の Blueprint 登録失敗: {e}")

        # static ファイル配信
        static_dir = _get_static_dir(ext)
        if static_dir:
            static_bp = Blueprint(
                f'_ext_static_{ext.name}',
                f'ext_{ext.name}',
                static_folder=static_dir,
                static_url_path=f'/extensions/{ext.name}/static',
            )
            app.register_blueprint(static_bp)

    app.config['TASKFLOW_EXTENSIONS'] = extensions


def _get_static_dir(ext: TaskFlowExtension):
    """拡張パッケージの static/ ディレクトリパスを返す。なければ None。"""
    module = sys.modules.get(f'extensions.{ext.name}')
    if module and hasattr(module, '__file__') and module.__file__:
        pkg_dir = os.path.dirname(module.__file__)
        static_dir = os.path.join(pkg_dir, 'static')
        if os.path.isdir(static_dir):
            return static_dir
    return None
