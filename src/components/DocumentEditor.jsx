import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Check, CircleNotch, Code, FilePlus, FloppyDisk, LinkSimple,
  ListBullets, Quotes, TextB, TextH, TextItalic, X,
} from '@phosphor-icons/react';

const saveLabels = { saved: '已保存到本机', pending: '等待保存', saving: '正在保存', error: '保存失败' };
const isMarkdown = (format) => ['md', 'markdown', 'mdown'].includes(format);

export function DocumentEditor({ draft, status, error, onChange, onSave, onDone }) {
  const editor = useRef(null);
  const characters = useMemo(() => Array.from(draft.text).length, [draft.text]);
  const markdown = isMarkdown(draft.format);

  useEffect(() => {
    editor.current?.focus();
    editor.current?.setSelectionRange(0, 0);
  }, [draft.id]);

  function replaceSelection(start, end, replacement, selectionStart, selectionEnd) {
    const field = editor.current;
    const scrollTop = field.scrollTop;
    onChange({ text: draft.text.slice(0, start) + replacement + draft.text.slice(end) });
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(selectionStart, selectionEnd);
      field.scrollTop = scrollTop;
    });
  }

  function formatSelection(action) {
    const field = editor.current;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = draft.text.slice(start, end);

    if (['heading', 'list', 'quote'].includes(action)) {
      const lineStart = start === 0 ? 0 : draft.text.lastIndexOf('\n', start - 1) + 1;
      const lastSelected = end > start && draft.text[end - 1] === '\n' ? end - 1 : end;
      const nextBreak = draft.text.indexOf('\n', lastSelected);
      const lineEnd = nextBreak === -1 ? draft.text.length : nextBreak;
      const prefix = { heading: '## ', list: '- ', quote: '> ' }[action];
      const content = draft.text.slice(lineStart, lineEnd);
      const replacement = content.split('\n').map((line) => prefix + line).join('\n');
      replaceSelection(lineStart, lineEnd, replacement, lineStart + prefix.length, lineStart + replacement.length);
      return;
    }

    if (action === 'link') {
      const label = selected || '链接文字';
      const replacement = `[${label}](https://)`;
      const addressStart = start + label.length + 3;
      replaceSelection(start, end, replacement, addressStart, addressStart + 8);
      return;
    }

    const blockCode = action === 'code' && selected.includes('\n');
    const before = blockCode ? '```\n' : { bold: '**', italic: '*', code: '`' }[action];
    const after = blockCode ? '\n```' : before;
    const content = selected || { bold: '加粗文字', italic: '斜体文字', code: '代码' }[action];
    replaceSelection(start, end, before + content + after, start + before.length, start + before.length + content.length);
  }

  const formatting = [
    ['heading', '标题', TextH], ['bold', '加粗', TextB], ['italic', '斜体', TextItalic],
    ['list', '列表', ListBullets], ['quote', '引用', Quotes], ['code', '代码', Code], ['link', '链接', LinkSimple],
  ];

  return <section className="document-editor" aria-label="文档编辑器">
    <header className="editor-header">
      <div className="editor-file">
        <span className="format-badge">{markdown ? 'MD' : draft.format.toUpperCase()}</span>
        <input className="editor-filename" aria-label="文档名称" value={draft.name} onChange={(event) => onChange({ name: event.target.value })} spellCheck={false} />
      </div>
      <div className="editor-header-actions">
        <span className={`editor-save-status status-${status}`} role="status">{status === 'saved' && <Check size={14} />}{status === 'saving' && <CircleNotch size={14} className="editor-spinner" />}{saveLabels[status]}</span>
        <button type="button" className="editor-save" onClick={onSave} disabled={status === 'saving'} title="保存 · Ctrl / ⌘ S"><FloppyDisk size={18} weight="light" /><span>保存</span></button>
        <button type="button" className="editor-read" onClick={onDone}><BookOpen size={18} weight="light" /><span>查看排版</span></button>
      </div>
    </header>

    {markdown && <div className="editor-formatting" role="toolbar" aria-label="Markdown 格式">
      {formatting.map(([action, label, Icon]) => <button key={action} type="button" className="editor-format-button" aria-label={label} title={label} onMouseDown={(event) => event.preventDefault()} onClick={() => formatSelection(action)}><Icon size={19} weight="light" /></button>)}
      <span className="editor-format-hint">Markdown</span>
    </div>}

    {error && <div className="editor-error" role="alert">{error}</div>}

    <textarea ref={editor} className="editor-textarea" aria-label="文档内容" value={draft.text} onChange={(event) => onChange({ text: event.target.value })} placeholder={markdown ? '从一行文字开始。\n\n用 # 写下标题，用 **文字** 标记重点。' : '从一行文字开始。'} spellCheck={false} autoCapitalize="off" autoCorrect="off" onKeyDown={(event) => {
      if (!markdown || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      const action = { b: 'bold', i: 'italic', k: 'link' }[event.key.toLowerCase()];
      if (action) { event.preventDefault(); formatSelection(action); }
    }} />

    <footer className="editor-footer"><span>{characters.toLocaleString()} 字符</span><span>UTF-8<span className="editor-footer-dot">·</span>自动保存到本机</span></footer>
  </section>;
}

export function NewDocumentDialog({ defaultName, onCreate, onClose }) {
  const dialog = useRef(null);
  const nameInput = useRef(null);
  const [name, setName] = useState(defaultName);
  const [format, setFormat] = useState('md');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const modal = dialog.current;
    modal.showModal();
    nameInput.current.focus();
    nameInput.current.select();
    return () => modal.close();
  }, []);

  function selectFormat(next) {
    setFormat(next);
    setName((current) => current.replace(/\.(md|markdown|mdown|txt)$/i, `.${next}`));
  }

  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const base = name.trim() || '未命名文档';
    const filename = /\.(md|markdown|mdown|txt)$/i.test(base) ? base.replace(/\.(md|markdown|mdown|txt)$/i, `.${format}`) : `${base}.${format}`;
    try {
      await onCreate({ name: filename, format });
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="new-document-dialog" aria-labelledby="new-document-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={create}>
      <header className="new-document-heading"><span className="new-document-symbol"><FilePlus size={24} weight="light" /></span><button type="button" className="icon-button" title="关闭新建文档" aria-label="关闭新建文档" disabled={busy} onClick={onClose}><X size={19} /></button></header>
      <h2 id="new-document-title">从空白的一页开始</h2>
      <p className="new-document-description">给这份文字取个名字。</p>
      <label className="new-document-label" htmlFor="new-document-name">文档名称</label>
      <input ref={nameInput} id="new-document-name" className="new-document-name" value={name} onChange={(event) => setName(event.target.value)} spellCheck={false} disabled={busy} />
      <span className="new-document-label">文档格式</span>
      <div className="new-document-formats" role="group" aria-label="文档格式">
        <button type="button" className={format === 'md' ? 'chosen' : ''} aria-pressed={format === 'md'} disabled={busy} onClick={() => selectFormat('md')}><strong>Markdown</strong><span>标题、列表与丰富排版</span></button>
        <button type="button" className={format === 'txt' ? 'chosen' : ''} aria-pressed={format === 'txt'} disabled={busy} onClick={() => selectFormat('txt')}><strong>TXT</strong><span>简单纯粹的文字</span></button>
      </div>
      {error && <p className="new-document-error" role="alert">{error}</p>}
      <div className="new-document-actions"><button type="button" className="new-document-cancel" onClick={onClose} disabled={busy}>取消</button><button type="submit" className="open-document" disabled={busy}>{busy ? <><CircleNotch size={19} className="editor-spinner" />正在创建</> : <><FilePlus size={19} weight="light" />创建文档</>}</button></div>
    </form>
  </dialog>;
}
