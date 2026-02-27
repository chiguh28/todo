"""TaskFlow — アプリケーションファクトリ"""

import os

from flask import Flask, jsonify

from .core.database import get_db, close_db, init_db
from .core.routes import register_routes
from .extensions import discover_extensions, register_extensions


def create_app(instance_path=None):
    """
    Flask アプリを生成・設定して返す。

    Args:
        instance_path: tasks.db と extensions/ の置き場所。
                       省略時は taskflow パッケージの親ディレクトリ (= app.py の隣)。
    """
    if instance_path is None:
        instance_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    app = Flask(
        __name__,
        static_folder=os.path.join(os.path.dirname(__file__), 'static'),
        template_folder=os.path.join(os.path.dirname(__file__), 'templates'),
    )
    app.config['DB_PATH'] = os.path.join(instance_path, 'tasks.db')

    # DB ライフサイクル
    app.teardown_appcontext(close_db)

    # コアテーブル作成
    with app.app_context():
        init_db()

    # コア API ルート登録
    register_routes(app)

    # 拡張機能ロード
    extensions_dir = os.path.join(instance_path, 'extensions')
    print("拡張機能を読み込み中...")
    extensions = discover_extensions(extensions_dir)
    with app.app_context():
        register_extensions(app, extensions, get_db)
    print(f"{len(extensions)} 件の拡張機能を登録しました")

    # 拡張機能一覧 API
    @app.route('/api/extensions')
    def list_extensions():
        result = []
        for ext in app.config.get('TASKFLOW_EXTENSIONS', []):
            static_files = ext.get_static_files()
            result.append({
                'name': ext.name,
                'label': ext.label,
                'version': ext.version,
                'jsx': [
                    f'/extensions/{ext.name}/static/{f}'
                    for f in static_files.get('jsx', [])
                ],
                'css': [
                    f'/extensions/{ext.name}/static/{f}'
                    for f in static_files.get('css', [])
                ],
            })
        return jsonify(result)

    return app
