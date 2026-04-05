import os
from flask import Blueprint, request, jsonify, current_app
from taskflow.extensions.base import TaskFlowExtension


class Extension(TaskFlowExtension):
    name = 'document_editor'
    label = '手順書エディター'
    version = '1.0'

    def get_blueprint(self):
        bp = Blueprint('document_editor', __name__, url_prefix='')

        @bp.route('/api/tasks/<int:task_id>/document', methods=['GET'])
        def get_document(task_id):
            from taskflow.core.database import get_db
            db = get_db()
            row = db.execute(
                "SELECT content, updated_at FROM ext_documents WHERE task_id = ?", (task_id,)
            ).fetchone()
            if row:
                return jsonify({'content': row['content'], 'updated_at': row['updated_at']})
            return jsonify({'content': '', 'updated_at': None})

        @bp.route('/api/tasks/<int:task_id>/document', methods=['PUT'])
        def save_document(task_id):
            from taskflow.core.database import get_db
            data = request.json
            content = data.get('content', '')
            db = get_db()
            if not db.execute("SELECT 1 FROM tasks WHERE id = ?", (task_id,)).fetchone():
                return jsonify({'error': 'タスクが見つかりません'}), 404
            db.execute(
                """INSERT INTO ext_documents (task_id, content, updated_at)
                   VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
                   ON CONFLICT(task_id) DO UPDATE SET
                     content = excluded.content,
                     updated_at = excluded.updated_at""",
                (task_id, content),
            )
            db.commit()
            return jsonify({'status': 'ok'})

        @bp.route('/api/templates', methods=['GET'])
        def get_templates():
            docs_dir = os.path.normpath(os.path.join(current_app.root_path, '..', 'docs'))
            templates = []
            if os.path.isdir(docs_dir):
                for fname in sorted(os.listdir(docs_dir)):
                    if fname.endswith('.md'):
                        with open(os.path.join(docs_dir, fname), 'r', encoding='utf-8') as f:
                            content = f.read()
                        templates.append({'name': fname[:-3], 'content': content})
            return jsonify(templates)

        return bp

    def init_db(self, db):
        db.execute("""
            CREATE TABLE IF NOT EXISTS ext_documents (
                task_id INTEGER PRIMARY KEY,
                content TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )
        """)
        # task_documents から移行（旧コアテーブルが存在する場合）
        existing = db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='task_documents'"
        ).fetchone()
        if existing:
            db.execute("INSERT OR IGNORE INTO ext_documents SELECT * FROM task_documents")
        db.commit()

    def get_static_files(self):
        return {'jsx': ['document_editor.jsx'], 'css': []}
