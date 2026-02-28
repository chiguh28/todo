"""TaskFlow拡張機能の基底クラス"""


class TaskFlowExtension:
    """
    拡張機能の基底クラス。サブクラスで必要なメソッドをオーバーライドする。

    必須属性:
        name (str): 一意なID (例: "labels") — URLや内部識別に使用
        label (str): 日本語表示名 (例: "ラベル管理")

    オーバーライド可能なメソッド:
        get_blueprint(): Flask Blueprint (APIルート) を返す
        init_db(db):    拡張固有のテーブルを作成する (CREATE TABLE IF NOT EXISTS)
        get_static_files(): フロントエンドに読み込むJSX/CSSファイルを返す

    DB規約:
        - テーブル名は必ず "ext_" プレフィクスを付けること (例: ext_labels)
        - CREATE TABLE IF NOT EXISTS で冪等性を確保すること
        - コアテーブル参照時は ON DELETE CASCADE を使用すること
    """

    name: str = ""
    label: str = ""
    version: str = "1.0"

    def get_blueprint(self):
        """Flask Blueprint を返す。APIルートが不要な場合は None を返す。"""
        return None

    def init_db(self, db):
        """
        拡張固有のテーブルを作成する。
        アプリ起動時に sqlite3 接続オブジェクトを受け取り呼び出される。
        """
        pass

    def get_static_files(self):
        """
        フロントエンドに読み込むファイル一覧を返す。

        Returns:
            dict: {
                'jsx': ['my_extension.jsx'],  # Babelが処理するJSXファイル
                'css': ['my_extension.css'],  # CSSファイル
            }
        ファイルは拡張フォルダ内の static/ から配信される。
        """
        return {'jsx': [], 'css': []}
