import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, ArrowsIn, ArrowsOut, BookOpen, Check, Code,
  DotsThree, DownloadSimple, FileText, ListBullets, MagnifyingGlass,
  Moon, Plus, SidebarSimple, Sun, TextAa, Trash, X,
} from '@phosphor-icons/react';
import { parseDocument, SUPPORTED_EXTENSIONS } from './lib/parse.js';
import { ensureSamples, listDocuments, getDocument, saveDocument, removeDocument, updateDocumentMetadata } from './lib/storage.js';
import { applySearch } from './lib/search.js';

const defaults = { theme: 'paper', fontSize: 19, lineHeight: 1.9, font: 'serif', width: 'comfortable' };
const encodings = [['auto', '自动识别'], ['utf-8', 'UTF-8'], ['gb18030', 'GB18030 / GBK'], ['big5', 'Big5 繁体'], ['utf-16le', 'UTF-16 LE'], ['utf-16be', 'UTF-16 BE'], ['windows-1252', 'Windows-1252']];
const formatName = (format) => ({ markdown: 'MD', md: 'MD', txt: 'TXT', log: 'LOG', html: 'HTML', htm: 'HTML', docx: 'DOCX', json: 'JSON', csv: 'CSV', tsv: 'TSV' }[format] || format?.toUpperCase() || 'TXT');
const withoutExtension = (name) => name.replace(/\.[^.]+$/, '');
const fileSize = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const readProgress = (id) => Number(localStorage.getItem(`leaf.progress.${id}`) || 0);

function IconButton({ label, children, active, className = '', ...props }) {
  return <button type="button" className={`icon-button ${active ? 'is-active' : ''} ${className}`} title={label} aria-label={label} {...props}>{children}</button>;
}

export function App() {
  const [documents, setDocuments] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [record, setRecord] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [prefs, setPrefs] = useState(() => ({ ...defaults, ...JSON.parse(localStorage.getItem('leaf.preferences') || '{}') }));
  const [libraryQuery, setLibraryQuery] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [panel, setPanel] = useState(null);
  const [focus, setFocus] = useState(false);
  const [source, setSource] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState(0);
  const [matchIndex, setMatchIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [activeHeading, setActiveHeading] = useState('');
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const picker = useRef(null);
  const scrollArea = useRef(null);
  const article = useRef(null);
  const searchInput = useRef(null);
  const searchResult = useRef(null);
  const scrollTimer = useRef(null);
  const dragDepth = useRef(0);
  const restoreFrame = useRef(0);
  const restoring = useRef(false);
  const pendingAnchor = useRef(null);
  const refreshLibrary = useCallback(async () => setDocuments(await listDocuments()), []);
  const openPicker = useCallback(() => picker.current?.click(), []);

  useEffect(() => {
    ensureSamples().then(listDocuments).then((items) => {
      setDocuments(items);
      const last = localStorage.getItem('leaf.active');
      setActiveId(items.find((item) => item.id === last)?.id || items[0]?.id || null);
      setReady(true);
    }).catch((e) => { setError(e.message); setReady(true); });
    const install = (event) => { event.preventDefault(); setInstallPrompt(event); };
    const offline = () => setOfflineReady(true);
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('leaf:offline-ready', offline);
    return () => { window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('leaf:offline-ready', offline); };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', prefs.theme === 'dark' ? '#20211f' : prefs.theme === 'light' ? '#ffffff' : '#faf8f3');
    localStorage.setItem('leaf.preferences', JSON.stringify(prefs));
  }, [prefs]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let current = true;
    setSource(false); setError(''); setPanel(null); setQuery(''); setParsed(null);
    if (!activeId) { setRecord(null); setLoading(false); return; }
    setLoading(true);
    localStorage.setItem('leaf.active', activeId);
    getDocument(activeId).then((doc) => { if (current) setRecord(doc); }).catch((e) => { if (current) { setError(e.message); setLoading(false); } });
    return () => { current = false; };
  }, [activeId]);

  useEffect(() => {
    if (!record || record.id !== activeId) return;
    let current = true;
    let urls = [];
    setLoading(true);
    parseDocument(record).then(async (result) => {
      urls = result.objectUrls || [];
      if (!current) { urls.forEach(URL.revokeObjectURL); return; }
      restoring.current = true;
      setParsed(result); setLoading(false); setError('');
      document.title = `${result.title} · 纸间 Leaf`;
      await updateDocumentMetadata(record.id, { title: result.title, format: result.format, openedAt: Date.now() });
      if (current) refreshLibrary();
    }).catch((e) => { if (current) { setError(`无法打开这份文档：${e.message}`); setLoading(false); } });
    return () => { current = false; urls.forEach(URL.revokeObjectURL); };
  }, [record, activeId, refreshLibrary]);

  const updateScroll = useCallback(() => {
    const el = scrollArea.current;
    if (!el || !activeId || !parsed || loading || record?.id !== activeId || restoring.current) return;
    const range = el.scrollHeight - el.clientHeight;
    const ratio = range > 0 ? Math.max(0, Math.min(1, el.scrollTop / range)) : 0;
    setProgress(Math.round(ratio * 100));
    let heading = parsed?.headings[0]?.id || '';
    const top = el.getBoundingClientRect().top;
    for (const item of article.current?.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]') || []) {
      if (item.getBoundingClientRect().top - top < 155) heading = item.id;
      else break;
    }
    setActiveHeading(heading);
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => localStorage.setItem(`leaf.progress.${activeId}`, String(ratio)), 250);
  }, [activeId, parsed, loading, record]);

  useEffect(() => {
    if (!parsed || !scrollArea.current) return;
    const ratio = readProgress(activeId);
    restoreFrame.current = requestAnimationFrame(() => {
      restoreFrame.current = requestAnimationFrame(() => {
        const el = scrollArea.current;
        if (!el) return;
        el.scrollTop = ratio * Math.max(0, el.scrollHeight - el.clientHeight);
        setProgress(Math.round(ratio * 100));
        setActiveHeading(parsed.headings[0]?.id || '');
        restoring.current = false;
        if (pendingAnchor.current?.documentId === activeId) {
          const fragment = pendingAnchor.current.fragment;
          const anchor = document.getElementById(fragment) || document.getElementById(`section-${fragment}`);
          anchor?.scrollIntoView({ block: 'start' });
          pendingAnchor.current = null;
        }
      });
    });
    return () => cancelAnimationFrame(restoreFrame.current);
  }, [parsed, activeId, source]);

  useEffect(() => {
    const remember = () => {
      const el = scrollArea.current;
      if (el && activeId && parsed && !loading && record?.id === activeId && !restoring.current) {
        localStorage.setItem(`leaf.progress.${activeId}`, String(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)));
      }
    };
    window.addEventListener('pagehide', remember);
    return () => window.removeEventListener('pagehide', remember);
  }, [activeId, parsed, loading, record]);

  useEffect(() => {
    if (!article.current || !parsed) return;
    const result = applySearch(article.current, searchOpen ? query : '');
    searchResult.current = result;
    setMatches(result.count); setMatchIndex(0);
    if (result.count) result.focus(0);
    return () => { result.clear(); searchResult.current = null; };
  }, [query, searchOpen, parsed, source]);

  useEffect(() => { if (searchOpen) searchInput.current?.focus(); }, [searchOpen]);

  useEffect(() => {
    const keyboard = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); openPicker(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && activeId) { event.preventDefault(); setSearchOpen(true); searchInput.current?.focus(); }
      if (event.key === 'Escape') { setPanel(null); setDrawer(null); setSearchOpen(false); setFocus(false); }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [openPicker, activeId]);

  async function importFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const images = files.filter((file) => file.type.startsWith('image/')).map((file) => ({ name: file.webkitRelativePath || file.name, blob: file }));
    const readable = files.filter((file) => SUPPORTED_EXTENSIONS.includes(`.${file.name.split('.').pop().toLowerCase()}`));
    if (!readable.length) { setToast('请选择 TXT、Markdown、DOCX、HTML、JSON 或 CSV 文档。'); return; }
    try {
      const ids = [];
      for (const file of readable) {
        const id = crypto.randomUUID();
        await saveDocument({ id, name: file.name, title: withoutExtension(file.name), format: file.name.split('.').pop().toLowerCase(), size: file.size, addedAt: Date.now(), openedAt: Date.now(), blob: file, assets: images, encoding: 'auto', isSample: false });
        ids.push(id);
      }
      await refreshLibrary(); setActiveId(ids[0]); setDrawer(null);
      setToast(readable.length === 1 ? '文档已放进书架' : `${readable.length} 份文档已放进书架`);
      navigator.storage?.persist?.();
    } catch (e) { setToast(`文档未能保存：${e.message}`); }
    if (picker.current) picker.current.value = '';
  }

  function chooseDocument(id) {
    if (activeId && scrollArea.current) {
      const el = scrollArea.current;
      clearTimeout(scrollTimer.current);
      localStorage.setItem(`leaf.progress.${activeId}`, String(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)));
    }
    setActiveId(id); setDrawer(null);
  }

  async function deleteDocument(id) {
    await removeDocument(id); localStorage.removeItem(`leaf.progress.${id}`);
    const items = await listDocuments(); setDocuments(items);
    if (id === activeId) setActiveId(items[0]?.id || null);
    setPanel(null); setToast('文档已从书架移除');
  }

  function downloadDocument() {
    const url = URL.createObjectURL(record.blob);
    const link = document.createElement('a');
    link.href = url; link.download = record.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setPanel(null);
  }

  async function changeEncoding(encoding) {
    const updated = { ...record, encoding };
    await saveDocument(updated); setRecord(updated);
  }

  function jumpToHeading(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveHeading(id); setDrawer(null);
  }

  function moveMatch(direction) {
    if (!matches) return;
    const next = (matchIndex + direction + matches) % matches;
    setMatchIndex(next); searchResult.current?.focus(next);
  }

  async function articleClick(event) {
    const copy = event.target.closest('[data-copy-code]');
    if (copy) {
      const code = copy.closest('.code-block')?.querySelector('pre code')?.textContent;
      if (code !== undefined) { await navigator.clipboard.writeText(code); setToast('代码已复制'); }
      return;
    }
    const link = event.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (href?.startsWith('#')) { event.preventDefault(); jumpToHeading(decodeURIComponent(href.slice(1))); }
    else if (href && !/^(https?:|mailto:|tel:|data:|blob:)/i.test(href)) {
      event.preventDefault();
      const [path, fragment] = href.split('#');
      const target = documents.find((item) => item.name === decodeURIComponent(path.split('/').pop()));
      if (target) {
        if (fragment) {
          const decoded = decodeURIComponent(fragment);
          if (target.id === activeId) {
            const anchor = document.getElementById(decoded) || document.getElementById(`section-${decoded}`);
            anchor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else pendingAnchor.current = { documentId: target.id, fragment: decoded };
        }
        chooseDocument(target.id);
      }
      else setToast('先将链接指向的文档加入书架');
    }
  }

  async function installApp() {
    setPanel(null);
    if (installPrompt) { await installPrompt.prompt(); setInstallPrompt(null); }
    else setPanel('install');
  }

  const filtered = documents.filter((item) => `${item.title} ${item.name}`.toLowerCase().includes(libraryQuery.toLowerCase()));
  const setPreference = (key, value) => setPrefs((old) => ({ ...old, [key]: value }));
  const togglePanel = (next) => setPanel((current) => current === next ? null : next);
  const format = formatName(parsed?.format || record?.format);
  const documentMarkup = useMemo(() => ({ __html: parsed?.html || '' }), [parsed?.html]);
  const readerStyle = { '--reading-size': `${prefs.fontSize}px`, '--reading-leading': prefs.lineHeight, '--reading-width': prefs.width === 'wide' ? '1040px' : '820px' };

  const outline = <>
    <div className="outline-title"><span>目录</span><IconButton label="关闭目录" className="drawer-close" onClick={() => setDrawer(null)}><X size={20} /></IconButton></div>
    {parsed?.headings.length && !source ? <nav className="outline-links" aria-label="文档目录">{parsed.headings.map((heading) => <button key={heading.id} className={`${heading.id === activeHeading ? 'current' : ''} level-${Math.min(heading.level, 4)}`} onClick={() => jumpToHeading(heading.id)}>{heading.text.replace(/^\d{2}\s+/, '')}</button>)}</nav> : <p className="outline-empty">{source ? '切换到阅读视图查看目录' : '文档中的标题会显示在这里'}</p>}
  </>;

  return <div className={`app ${focus ? 'focus-mode' : ''} ${dragging ? 'is-dragging' : ''}`} style={readerStyle}
    onDragEnter={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) { dragDepth.current++; setDragging(true); } }}
    onDragOver={(e) => e.preventDefault()}
    onDragLeave={(e) => { e.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) setDragging(false); }}
    onDrop={(e) => { e.preventDefault(); dragDepth.current = 0; setDragging(false); importFiles(e.dataTransfer.files); }}>
    <input ref={picker} type="file" className="file-input" aria-label="选择要阅读的文档" accept={`${SUPPORTED_EXTENSIONS.join(',')},image/*`} multiple onChange={(e) => importFiles(e.target.files)} />
    {drawer && <button className="drawer-backdrop" aria-label="关闭侧栏" onClick={() => setDrawer(null)} />}
    <aside className={`library ${drawer === 'library' ? 'drawer-open' : ''}`} aria-label="文档书架">
      <div className="brand-row"><button className="brand" onClick={() => { setFocus(false); setDrawer(null); }} aria-label="纸间 Leaf"><img src="/icons/icon-192.png" alt="" /><span><strong>纸间</strong><small>LEAF</small></span></button><IconButton label="关闭书架" className="drawer-close" onClick={() => setDrawer(null)}><X size={20} /></IconButton></div>
      <button className="open-document" onClick={openPicker}><Plus size={21} weight="light" /><span>打开文档</span></button>
      <label className="library-search"><MagnifyingGlass size={20} weight="light" /><input placeholder="搜索文档…" value={libraryQuery} onChange={(e) => setLibraryQuery(e.target.value)} aria-label="搜索书架" />{libraryQuery && <button onClick={() => setLibraryQuery('')} aria-label="清除书架搜索"><X size={15} /></button>}</label>
      <div className="library-heading"><span>{libraryQuery ? '搜索结果' : '最近阅读'}</span><span className="document-count">{filtered.length}</span></div>
      <nav className="document-list" aria-label="最近阅读">{filtered.map((item) => <button className={`document-row ${item.id === activeId ? 'selected' : ''}`} key={item.id} onClick={() => chooseDocument(item.id)} title={item.name}><FileText size={21} weight="light" /><span className="document-name">{item.name}</span></button>)}
      {ready && !filtered.length && <div className="library-empty">{libraryQuery ? '没有找到这份文档' : '书架还空着，打开一份文档吧。'}</div>}
      </nav>
      <div className="library-bottom"><div className="library-note"><span className="status-dot" />{offlineReady ? '已就绪，随时离线阅读' : '一页之间，慢慢读'}</div><div className="library-bottom-actions"><div className="theme-switcher" aria-label="阅读主题"><IconButton label="浅色主题" active={prefs.theme === 'light'} onClick={() => setPreference('theme', 'light')}><Sun size={19} weight="light" /></IconButton><IconButton label="纸色主题" active={prefs.theme === 'paper'} onClick={() => setPreference('theme', 'paper')}><BookOpen size={19} weight="light" /></IconButton><IconButton label="深色主题" active={prefs.theme === 'dark'} onClick={() => setPreference('theme', 'dark')}><Moon size={19} weight="light" /></IconButton></div><IconButton label="安装纸间" onClick={installApp}><DownloadSimple size={19} weight="light" /></IconButton></div></div>
    </aside>

    <main className="workspace">
      <header className="toolbar">
        <IconButton label="打开书架" className="mobile-menu" onClick={() => { setDrawer('library'); setPanel(null); }}><SidebarSimple size={22} weight="light" /></IconButton>
        {focus && <IconButton label="打开文档" onClick={openPicker}><Plus size={22} weight="light" /></IconButton>}
        <div className="document-caption"><FileText size={21} weight="light" /><span>{record?.name || '纸间 · Leaf'}</span></div>
        <div className="toolbar-actions">
          <button className={`toolbar-action ${searchOpen ? 'is-active' : ''}`} title="查找文档内容 · Ctrl / ⌘ F" aria-label="查找文档内容" disabled={!parsed} onClick={() => { setSearchOpen((v) => !v); setPanel(null); }}><MagnifyingGlass size={21} weight="light" /><span>搜索</span></button>
          <span className="toolbar-divider" />
          <button className={`toolbar-action appearance-button ${panel === 'appearance' ? 'is-active' : ''}`} aria-label="阅读设置" title="阅读设置" aria-expanded={panel === 'appearance'} onClick={() => togglePanel('appearance')}><TextAa size={25} weight="light" /></button>
          <span className="toolbar-divider desktop-divider" />
          <button className={`toolbar-action focus-button ${focus ? 'is-active' : ''}`} aria-label={focus ? '退出专注' : '专注阅读'} title="专注阅读 · Esc 退出" onClick={() => { setFocus((v) => !v); setPanel(null); }}>{focus ? <ArrowsIn size={20} weight="light" /> : <ArrowsOut size={20} weight="light" />}<span>{focus ? '退出' : '专注'}</span></button>
          <IconButton label="打开目录" className="mobile-outline" onClick={() => { setDrawer('outline'); setPanel(null); }}><ListBullets size={22} weight="light" /></IconButton>
          <IconButton label="文档选项" active={panel === 'more'} onClick={() => togglePanel('more')}><DotsThree size={24} /></IconButton>
        </div>
      </header>

      {searchOpen && <div className="search-bar"><MagnifyingGlass size={19} /><input ref={searchInput} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); moveMatch(e.shiftKey ? -1 : 1); } }} placeholder="在文档中查找…" aria-label="查找内容" /><span className="search-count" aria-live="polite">{query ? matches ? `${matchIndex + 1} / ${matches}` : '无匹配' : ''}</span><IconButton label="上一个匹配" disabled={!matches} onClick={() => moveMatch(-1)}><ArrowUp size={18} /></IconButton><IconButton label="下一个匹配" disabled={!matches} onClick={() => moveMatch(1)}><ArrowDown size={18} /></IconButton><IconButton label="关闭查找" onClick={() => setSearchOpen(false)}><X size={18} /></IconButton></div>}

      {panel && <button className="popover-backdrop" aria-label="关闭菜单" onClick={() => setPanel(null)} />}
      {panel === 'appearance' && <section className="popover appearance-panel" role="dialog" aria-label="阅读设置">
        <div className="popover-heading"><span>让阅读更合心意</span><IconButton label="关闭阅读设置" onClick={() => setPanel(null)}><X size={17} /></IconButton></div>
        <div className="setting-row"><label htmlFor="font-size">字号</label><div className="stepper"><button aria-label="减小字号" disabled={prefs.fontSize <= 14} onClick={() => setPreference('fontSize', prefs.fontSize - 1)}>−</button><output id="font-size">{prefs.fontSize}</output><button aria-label="增大字号" disabled={prefs.fontSize >= 30} onClick={() => setPreference('fontSize', prefs.fontSize + 1)}>+</button></div></div>
        <div className="setting-row"><span>字体</span><div className="segmented">{[['serif', '宋体'], ['sans', '黑体'], ['mono', '等宽']].map(([key, label]) => <button key={key} className={prefs.font === key ? 'chosen' : ''} onClick={() => setPreference('font', key)}>{label}</button>)}</div></div>
        <div className="setting-row"><span>行距</span><div className="segmented">{[[1.6, '紧凑'], [1.9, '舒适'], [2.2, '宽松']].map(([key, label]) => <button key={key} className={prefs.lineHeight === key ? 'chosen' : ''} onClick={() => setPreference('lineHeight', key)}>{label}</button>)}</div></div>
        <div className="setting-row width-setting"><span>页宽</span><div className="segmented">{[['comfortable', '适中'], ['wide', '宽页']].map(([key, label]) => <button key={key} className={prefs.width === key ? 'chosen' : ''} onClick={() => setPreference('width', key)}>{label}</button>)}</div></div>
        <div className="theme-options">{[['light', '浅色'], ['paper', '纸色'], ['dark', '深色']].map(([key, label]) => <button key={key} aria-pressed={prefs.theme === key} className={`theme-choice ${prefs.theme === key ? 'chosen' : ''}`} onClick={() => setPreference('theme', key)}><span className={`theme-swatch ${key}`}>{prefs.theme === key && <Check size={19} />}</span><span>{label}</span></button>)}</div>
        <button className="reset-preferences" onClick={() => setPrefs(defaults)}>恢复默认</button>
      </section>}

      {panel === 'more' && <section className="popover more-panel" role="menu" aria-label="文档选项">
        {record && <><button role="menuitem" onClick={() => { setSource((v) => !v); setPanel(null); }}><Code size={19} />{source ? '阅读视图' : '查看原文'}</button><button role="menuitem" onClick={downloadDocument}><DownloadSimple size={19} />下载原文件</button><div className="menu-divider" />{parsed?.format !== 'docx' && <label className="encoding-control">文本编码<select value={record.encoding || 'auto'} onChange={(e) => changeEncoding(e.target.value)}>{encodings.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}<div className="document-details"><span>{format} · {fileSize(record.size || record.blob.size)}</span><span>{parsed?.encoding && parsed.encoding !== 'binary' ? parsed.encoding.toUpperCase() : ''}</span></div><div className="menu-divider" /></>}
        <button role="menuitem" onClick={installApp}><DownloadSimple size={19} />安装到设备</button>
        {record && <button role="menuitem" className="danger" onClick={() => deleteDocument(record.id)}><Trash size={19} />从书架移除</button>}
      </section>}

      {panel === 'install' && <section className="popover install-panel" role="dialog" aria-label="安装纸间"><div className="popover-heading"><span>把纸间放在手边</span><IconButton label="关闭安装说明" onClick={() => setPanel(null)}><X size={18} /></IconButton></div><img src="/icons/icon-192.png" className="install-icon" alt="纸间应用图标" /><h3>像 App 一样打开</h3><p><strong>iPhone / iPad</strong><br />在 Safari 中打开，轻点「分享」，选择「添加到主屏幕」。</p><p><strong>MacBook</strong><br />Safari 菜单「文件」→「添加到程序坞」。</p><p><strong>Windows</strong><br />在 Edge 或 Chrome 地址栏选择「安装应用」。</p><span className="install-note">文档和阅读进度保存在当前设备。</span></section>}

      <div className={`reading-layout ${source ? 'source-layout' : ''}`}>
        <div ref={scrollArea} className="document-scroll" onScroll={updateScroll}>
          {!activeId && ready ? <div className="empty-state"><img src="/icons/icon-192.png" alt="" /><span className="eyebrow">纸间 LEAF</span><h1>留一点时间，<br />给文字。</h1><p>打开一份文档，从这一页开始。</p><button className="open-document" onClick={openPicker}><Plus size={21} />打开文档</button><span className="supported-formats">TXT · Markdown · DOCX · HTML · JSON · CSV</span><span className="drop-hint">也可以将文件拖到这里</span></div> : error ? <div className="error-state"><FileText size={35} weight="light" /><h2>文档没有打开</h2><p>{error}</p><button className="open-document" onClick={openPicker}>打开其他文档</button></div> : loading || !parsed ? <div className="loading-state" role="status"><BookOpen size={30} weight="light" /><span>正在翻开这一页…</span></div> : <div className={`reading-page font-${prefs.font} ${source ? 'showing-source' : ''}`}>
            <header className="article-header"><h1>{parsed.title}</h1><div className="article-meta"><span className="format-badge">{source ? '原文' : format}</span><span className="meta-dot">·</span><span>{parsed.minutes} 分钟阅读</span>{record?.isSample && <span className="sample-label">示例文档</span>}</div></header>
            <article ref={article} className={`article-content ${source ? 'source-content' : ''} format-${parsed.format}`} onClick={articleClick}>{source ? <pre className="source-text"><code>{parsed.text}</code></pre> : <div dangerouslySetInnerHTML={documentMarkup} />}</article>
            <div className="article-end"><span /><BookOpen size={20} weight="light" /><span /><p>读到这里，刚刚好。</p></div>
          </div>}
        </div>
        <aside className={`outline ${drawer === 'outline' ? 'drawer-open' : ''}`} aria-label="当前文档目录">{outline}</aside>
      </div>
      <footer className="reading-footer"><button className="footer-document" onClick={() => setDrawer('library')} title="切换文档"><BookOpen size={16} weight="light" /><span>{parsed ? `${parsed.words.toLocaleString()} 字` : '纸间 · Leaf'}</span></button><input type="range" min="0" max="100" step="1" value={progress} aria-label="阅读进度" style={{ '--progress': `${progress}%` }} onChange={(e) => { const el = scrollArea.current; if (el) el.scrollTop = Number(e.target.value) / 100 * (el.scrollHeight - el.clientHeight); }} /><span className="progress-label">{progress}%</span></footer>
    </main>
    {dragging && <div className="drop-overlay"><FileText size={46} weight="light" /><h2>松开，开始阅读</h2><p>文档与引用的图片可以一起拖入</p></div>}
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
  </div>;
}
