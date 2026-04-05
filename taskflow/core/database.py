"""DB接続・テーブル初期化・マイグレーション"""

import sqlite3
from flask import g, current_app


def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(current_app.config['DB_PATH'])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


def close_db(exception=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
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
            milestone DATE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (assignee_id) REFERENCES users(id),
            FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE SET NULL
        );
    """)
    # マイグレーション: 旧DBにestimated_hoursがない場合 / end_dateカラムを削除
    cols = [r[1] for r in db.execute("PRAGMA table_info(tasks)").fetchall()]
    if 'end_date' in cols:
        db.executescript("""
            PRAGMA foreign_keys=OFF;
            CREATE TABLE tasks_new (
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
            INSERT INTO tasks_new (id, title, description, assignee_id, start_date, estimated_hours,
                progress, priority, status, parent_id, sort_order, created_at, updated_at)
            SELECT id, title, description, assignee_id, start_date,
                COALESCE(estimated_hours, 8),
                progress, priority, status, parent_id, sort_order, created_at, updated_at
            FROM tasks;
            DROP TABLE tasks;
            ALTER TABLE tasks_new RENAME TO tasks;
            PRAGMA foreign_keys=ON;
        """)
        db.commit()
        cols = [r[1] for r in db.execute("PRAGMA table_info(tasks)").fetchall()]
    if 'estimated_hours' not in cols:
        db.execute("ALTER TABLE tasks ADD COLUMN estimated_hours REAL NOT NULL DEFAULT 8")
        db.execute("""
            UPDATE tasks
            SET estimated_hours = MAX(1, (julianday(end_date) - julianday(start_date) + 1) * 8)
        """)
        db.commit()
    if 'milestone' not in cols:
        db.execute("ALTER TABLE tasks ADD COLUMN milestone DATE")
        db.commit()
        cols = [r[1] for r in db.execute("PRAGMA table_info(tasks)").fetchall()]
    if 'category' not in cols:
        db.execute("ALTER TABLE tasks ADD COLUMN category TEXT DEFAULT ''")
        db.commit()
        cols = [r[1] for r in db.execute("PRAGMA table_info(tasks)").fetchall()]
    # task_documents テーブル
    db.execute("""
        CREATE TABLE IF NOT EXISTS task_documents (
            task_id INTEGER PRIMARY KEY,
            content TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    """)
    db.commit()
    # デフォルトユーザーの初期投入
    if db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        db.executemany(
            "INSERT INTO users (name, color) VALUES (?, ?)",
            [('田中', '#4A90D9'), ('佐藤', '#E8913A'), ('鈴木', '#50B83C')],
        )
    db.commit()
