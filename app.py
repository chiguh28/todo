"""
TaskFlow - Todo管理 + ガントチャート
Flask + SQLite + React (CDN)
"""

import os
import sqlite3

from flask import Flask, g, render_template, request, jsonify

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), 'tasks.db')


# --- Database ---

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    with app.app_context():
        db = get_db()
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT '#4A90D9',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                assignee_id INTEGER,
                start_date DATE NOT NULL,
                estimated_hours REAL NOT NULL DEFAULT 8,
                progress INTEGER DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
                priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
                status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done')),
                parent_id INTEGER,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (assignee_id) REFERENCES users(id),
                FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE SET NULL
            );
        """)
        # Migrate: add estimated_hours if missing (existing DBs)
        cols = [r[1] for r in db.execute("PRAGMA table_info(tasks)").fetchall()]
        if 'estimated_hours' not in cols:
            db.execute("ALTER TABLE tasks ADD COLUMN estimated_hours REAL NOT NULL DEFAULT 8")
            # Migrate existing rows: convert end_date - start_date to hours (8h/day)
            db.execute("""
                UPDATE tasks
                SET estimated_hours = MAX(1, (julianday(end_date) - julianday(start_date) + 1) * 8)
            """)
            db.commit()
        if db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            db.executemany(
                "INSERT INTO users (name, color) VALUES (?, ?)",
                [('田中', '#4A90D9'), ('佐藤', '#E8913A'), ('鈴木', '#50B83C')],
            )
        db.commit()


init_db()


TASK_SELECT = """
    SELECT t.*, u.name AS assignee_name, u.color AS assignee_color
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
"""

TASK_FIELDS = [
    'title', 'description', 'assignee_id', 'start_date', 'estimated_hours',
    'progress', 'priority', 'status', 'parent_id', 'sort_order',
]


# --- Routes ---

@app.route('/')
def index():
    return render_template('index.html')


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
    task = db.execute(
        TASK_SELECT + " WHERE t.id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(dict(task)), 201


@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    data = request.json
    db = get_db()
    fields = []
    values = []
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


if __name__ == '__main__':
    print("=" * 50)
    print("  TaskFlow - Todo管理 + ガントチャート")
    print("  http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, host='0.0.0.0', port=5000)
