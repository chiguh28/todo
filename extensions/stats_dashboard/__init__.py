from taskflow.extensions.base import TaskFlowExtension


class Extension(TaskFlowExtension):
    name = 'stats_dashboard'
    label = '統計ダッシュボード'
    version = '1.0'

    def get_static_files(self):
        return {'jsx': ['stats.jsx'], 'css': ['stats.css']}
