"""コアAPIルート (tasks / users) と トップページ"""

import sqlite3
from flask import render_template, request, jsonify, current_app

from .database import get_db
from .models import TASK_SELECT, TASK_FIELDS


def register_routes(app):
    """コアルートをFlaskアプリに登録する"""

    @app.route('/')
    def index():
        extensions = current_app.config.get('TASKFLOW_EXTENSIONS', [])
        return render_template('index.html', extensions=extensions)

    # --- Users API ---

    @app.route('/api/users', methods=['GET'])
    def get_users():
        db = get_db()
        users = db.execute("SELECT * FROM users ORDER BY id").fetchall()
        return jsonify([dict(u) for u in users])

    @app.route('/api/users', methods=['POST'])
    def create_user():
        data = request.json
        db = get_db()
        try:
            db.execute(
                "INSERT INTO users (name, color) VALUES (?, ?)",
                (data['name'], data.get('color', '#4A90D9')),
            )
            db.commit()
        except sqlite3.IntegrityError:
            return jsonify({'error': 'ユーザー名が重複しています'}), 400
        return jsonify({'status': 'ok'}), 201

    @app.route('/api/users/<int:user_id>', methods=['DELETE'])
    def delete_user(user_id):
        db = get_db()
        db.execute("UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ?", (user_id,))
        db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        db.commit()
        return jsonify({'status': 'ok'})

    # --- Tasks API ---

    @app.route('/api/tasks', methods=['GET'])
    def get_tasks():
        db = get_db()
        tasks = db.execute(
            TASK_SELECT + " ORDER BY t.sort_order, t.start_date, t.id"
        ).fetchall()
        return jsonify([dict(t) for t in tasks])

    @app.route('/api/tasks', methods=['POST'])
    def create_task():
        data = request.json
        db = get_db()
        cursor = db.execute(
            """INSERT INTO tasks (title, description, assignee_id, start_date, estimated_hours,
                                  progress, priority, status, parent_id, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data['title'],
                data.get('description', ''),
                data.get('assignee_id'),
                data['start_date'],
                data.get('estimated_hours', 8),
                data.get('progress', 0),
                data.get('priority', 'medium'),
                data.get('status', 'todo'),
                data.get('parent_id'),
                data.get('sort_order', 0),
            ),
        )
        db.commit()
        task = db.execute(TASK_SELECT + " WHERE t.id = ?", (cursor.lastrowid,)).fetchone()
        return jsonify(dict(task)), 201

    @app.route('/api/tasks/<int:task_id>', methods=['PUT'])
    def update_task(task_id):
        data = request.json
        db = get_db()
        fields, values = [], []
        for key in TASK_FIELDS:
            if key in data:
                fields.append(f"{key} = ?")
                values.append(data[key])
        if fields:
            fields.append("updated_at = CURRENT_TIMESTAMP")
            values.append(task_id)
            db.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = ?", values)
            db.commit()
        task = db.execute(TASK_SELECT + " WHERE t.id = ?", (task_id,)).fetchone()
        return jsonify(dict(task))

    @app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
    def delete_task(task_id):
        db = get_db()
        db.execute("UPDATE tasks SET parent_id = NULL WHERE parent_id = ?", (task_id,))
        db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        db.commit()
        return jsonify({'status': 'ok'})
