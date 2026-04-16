"""python -m taskflow で起動するエントリポイント"""

import os
from taskflow import create_app

app = create_app(instance_path=os.getcwd())

print("=" * 50)
print("  TaskFlow - Todo管理 + ガントチャート")
print("  http://localhost:5050")
print("=" * 50)
app.run(debug=True, host='0.0.0.0', port=5050)
