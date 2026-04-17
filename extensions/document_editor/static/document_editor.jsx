(() => {
  const { useState, useEffect, useRef } = React;
  const { createPortal } = ReactDOM;

  // ============ DocumentModal ============
  function DocumentModal({ task, onClose }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState(null);
    const quillContainerRef = useRef(null);
    const quillRef = useRef(null);
    const fileInputRef = useRef(null);
    const [templates, setTemplates] = useState([]);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);

    useEffect(() => {
      TaskFlow.api.get('/api/templates').then(setTemplates);
    }, []);

    useEffect(() => {
      if (typeof Quill === 'undefined') {
        setError('エディタの読み込みに失敗しました。ページを再読み込みしてください。');
        setLoading(false);
        return;
      }
      try {
        const q = new Quill(quillContainerRef.current, {
          theme: 'snow',
          modules: {
            toolbar: {
              container: [
                [{ header: [1, 2, 3, false] }],
                ['bold', 'italic', 'underline'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['link', 'image', 'code-block'],
                ['clean'],
              ],
              handlers: {
                image: () => fileInputRef.current && fileInputRef.current.click(),
              },
            },
          },
        });
        quillRef.current = q;
        TaskFlow.api.get(`/api/tasks/${task.id}/document`).then(data => {
          if (data.content) q.root.innerHTML = data.content;
          setLoading(false);
        }).catch(() => {
          setLoading(false);
        });
      } catch (e) {
        setError('エディタの初期化に失敗しました。ページを再読み込みしてください。');
        setLoading(false);
      }
    }, []);

    const handleSave = async () => {
      if (!quillRef.current) return;
      setSaving(true);
      try {
        await TaskFlow.api.put(`/api/tasks/${task.id}/document`, { content: quillRef.current.root.innerHTML });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        alert('保存に失敗しました。再度お試しください。');
      } finally {
        setSaving(false);
      }
    };

    const handleOpenPreview = () => {
      if (!quillRef.current) return;
      const sanitized = DOMPurify.sanitize(quillRef.current.root.innerHTML);
      const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${task.title} — 手順書プレビュー</title>
<link href="https://cdn.quilljs.com/1.3.7/quill.snow.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Noto Sans JP', sans-serif; max-width: 900px; margin: 40px auto; padding: 0 24px 60px; color: #1a1a2e; }
  h1.doc-title { font-size: 18px; color: #666; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 28px; font-weight: 500; }
  .doc-title span { font-size: 13px; color: #aaa; font-family: monospace; margin-left: 8px; }
  .ql-editor { padding: 0; font-size: 15px; line-height: 1.7; }
  .ql-editor img { max-width: 100%; border-radius: 6px; border: 1px solid #e5e7eb; }
  .ql-container.ql-snow { border: none; }
</style>
</head>
<body>
<h1 class="doc-title">📄 ${task.title}<span>#${task.id}</span></h1>
<div class="ql-editor">${sanitized}</div>
</body>
</html>`;
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    };

    const handleInsertTemplate = (tpl) => {
      if (!quillRef.current) return;
      const hasContent = quillRef.current.getText().trim().length > 0;
      if (hasContent && !confirm(`現在の内容を「${tpl.name}」テンプレートで置き換えますか？`)) return;
      quillRef.current.root.innerHTML = marked.parse(tpl.content);
      setShowTemplatePicker(false);
    };

    const handleImageInsert = (e) => {
      const file = e.target.files[0];
      if (!file || !quillRef.current) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const q = quillRef.current;
        const range = q.getSelection(true);
        q.insertEmbed(range ? range.index : 0, 'image', ev.target.result);
        if (range) q.setSelection(range.index + 1);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    };

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal doc-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">
              📄 手順書 — {task.title}
              <span className="doc-modal-task-id">#{task.id}</span>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
          </div>

          <div className="doc-modal-body">
            {loading && <div className="doc-loading">読み込み中...</div>}
            {error && <div className="doc-loading">{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div ref={quillContainerRef} className="doc-quill-container" />
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary btn-sm"
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}>
              🖼 画像を挿入
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleOpenPreview}>
              🔍 プレビュー
            </button>
            {templates.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowTemplatePicker(v => !v)}>
                  📋 テンプレート
                </button>
                {showTemplatePicker && (
                  <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: 200, zIndex: 100 }}>
                    {templates.map(tpl => (
                      <button key={tpl.name} onClick={() => handleInsertTemplate(tpl)}
                              style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        {tpl.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={onClose}>閉じる</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : saved ? '✓ 保存済み' : '💾 保存'}
            </button>
          </div>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*"
                 onChange={handleImageInsert} />
        </div>
      </div>
    );
  }

  // ============ DocCell（タスク行ごとのボタン + モーダル管理）============
  function DocCell({ task }) {
    const [showModal, setShowModal] = useState(false);
    return (
      <>
        <button className="btn btn-ghost btn-sm doc-icon-btn" onClick={() => setShowModal(true)} title="手順書">📄</button>
        {showModal && createPortal(
          <DocumentModal task={task} onClose={() => setShowModal(false)} />,
          document.body
        )}
      </>
    );
  }

  TaskFlow.registerExtension({
    name: 'document_editor',
    label: '手順書エディター',
    columns: [{
      header: '手順書',
      width: 60,
      render: (task) => <DocCell task={task} />,
    }],
  });
})();
