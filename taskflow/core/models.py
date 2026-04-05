"""タスク・ユーザーのSQL定数"""

TASK_SELECT = """
    SELECT t.*, u.name AS assignee_name, u.color AS assignee_color,
           COALESCE((SELECT 1 FROM task_documents d WHERE d.task_id = t.id), 0) AS has_document
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
"""

TASK_FIELDS = [
    'title', 'description', 'assignee_id', 'start_date', 'estimated_hours',
    'progress', 'priority', 'status', 'parent_id', 'sort_order', 'milestone',
    'category',
]
