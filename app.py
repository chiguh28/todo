"""TaskFlow ランチャー — python app.py で起動"""
from taskflow import create_app

app = create_app()

if __name__ == '__main__':
    print("=" * 50)
    print("  TaskFlow - Todo管理 + ガントチャート")
    print("  http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, host='0.0.0.0', port=5000)
