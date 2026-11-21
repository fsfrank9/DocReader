import { useEffect, useRef, useState } from 'react';
import {
  ArrowClockwise, CaretLeft, CaretRight, CircleNotch, FilePdf, ListBullets,
  LockKey, MagnifyingGlass, Minus, Plus, WarningCircle, X,
} from '@phosphor-icons/react';
import { AnnotationMode, GlobalWorkerOptions, PasswordResponses, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { EventBus, FindState, LinkTarget, PDFFindController, PDFLinkService, PDFViewer } from 'pdfjs-dist/legacy/web/pdf_viewer.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import '../pdf.css';

GlobalWorkerOptions.workerSrc = workerUrl;

const zoomLevels = ['0.5', '0.75', '1', '1.25', '1.5', '2', '3', '4'];
const fitModes = ['page-width', 'page-fit'];

function OutlineItems({ items, onNavigate }) {
  return <ul>{items.map((item, index) => <li key={index}>
    {item.url
      ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title || '未命名章节'}</a>
      : <button type="button" disabled={!item.dest} onClick={() => onNavigate(item.dest)}>{item.title || '未命名章节'}</button>}
    {item.items?.length > 0 && <OutlineItems items={item.items} onNavigate={onNavigate} />}
  </li>)}</ul>;
}

export function PdfReader({ record, onLoaded, onToast }) {
  const container = useRef(null);
  const pages = useRef(null);
  const runtime = useRef(null);
  const passwordCallback = useRef(null);
  const searchInput = useRef(null);
  const callbacks = useRef({ onLoaded, onToast });
  callbacks.current = { onLoaded, onToast };

  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [total, setTotal] = useState(0);
  const [scale, setScale] = useState(1);
  const [scaleValue, setScaleValue] = useState('page-width');
  const [outline, setOutline] = useState([]);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState({ current: 0, total: 0 });
  const [findState, setFindState] = useState(FindState.FOUND);
  const [password, setPassword] = useState('');
  const [passwordIncorrect, setPasswordIncorrect] = useState(false);

  useEffect(() => {
    let active = true;
    let ready = false;
    let loadingTask;
    let saveTimer;
    let resizeTimer;
    let progress;
    const progressKey = `leaf.pdf.${record.id}`;
    const saved = JSON.parse(localStorage.getItem(progressKey) || '{}');
    const controller = new AbortController();
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({
      eventBus, externalLinkTarget: LinkTarget.BLANK,
      externalLinkRel: 'noopener noreferrer', ignoreDestinationZoom: true,
    });
    const findController = new PDFFindController({ eventBus, linkService });
    const viewer = new PDFViewer({
      container: container.current, viewer: pages.current, eventBus, linkService, findController,
      annotationMode: AnnotationMode.ENABLE,
      imageResourcesPath: '/pdfjs/images/',
      maxCanvasPixels: 8 * 1024 * 1024,
      abortSignal: controller.signal,
    });
    linkService.setViewer(viewer);
    runtime.current = { viewer, eventBus, linkService };
    setStatus('loading');
    setError('');
    setTotal(0);
    setPage(1);
    setPageInput('1');
    setOutline([]);
    setOutlineOpen(false);
    setSearchOpen(false);
    setQuery('');
    setMatches({ current: 0, total: 0 });
    setPassword('');
    setPasswordIncorrect(false);

    function saveProgress() {
      if (progress) localStorage.setItem(progressKey, JSON.stringify(progress));
    }

    eventBus.on('pagesinit', () => {
      if (!active) return;
      viewer.currentScaleValue = saved.scale || 'page-width';
      viewer.pagesRotation = saved.rotation || 0;
      const pageNumber = Math.min(Math.max(saved.page || 1, 1), viewer.pagesCount);
      viewer.scrollPageIntoView({
        pageNumber,
        ...(saved.top !== undefined && { destArray: [null, { name: 'XYZ' }, saved.left || 0, saved.top, null] }),
      });
      ready = true;
      setStatus('ready');
    });
    eventBus.on('pagechanging', ({ pageNumber }) => {
      if (!active) return;
      setPage(pageNumber);
      setPageInput(String(pageNumber));
    });
    eventBus.on('scalechanging', ({ scale: nextScale, presetValue }) => {
      if (!active) return;
      setScale(nextScale);
      setScaleValue(presetValue || String(nextScale));
    });
    eventBus.on('updateviewarea', ({ location }) => {
      if (!ready || !active) return;
      const navigationChanged = !progress || progress.page !== location.pageNumber
        || progress.scale !== viewer.currentScaleValue || progress.rotation !== viewer.pagesRotation;
      progress = {
        page: location.pageNumber, scale: viewer.currentScaleValue,
        rotation: viewer.pagesRotation, left: location.left, top: location.top,
      };
      clearTimeout(saveTimer);
      if (navigationChanged) saveProgress();
      else saveTimer = setTimeout(saveProgress, 200);
    });
    eventBus.on('updatefindmatchescount', ({ matchesCount }) => {
      if (active) setMatches(matchesCount);
    });
    eventBus.on('updatefindcontrolstate', ({ state, matchesCount }) => {
      if (!active) return;
      setFindState(state);
      if (matchesCount) setMatches(matchesCount);
    });
    eventBus.on('pagerendered', ({ error: renderError }) => {
      if (active && renderError) callbacks.current.onToast?.('这一页未能完整显示，请尝试重新打开文档');
    });

    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (ready && fitModes.includes(viewer.currentScaleValue)) {
          viewer.currentScaleValue = viewer.currentScaleValue;
        }
      }, 100);
    });
    resizeObserver.observe(container.current);
    window.addEventListener('pagehide', saveProgress, { signal: controller.signal });

    async function openDocument() {
      const data = await record.blob.arrayBuffer();
      if (!active) return;
      loadingTask = getDocument({
        data, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true,
        standardFontDataUrl: '/pdfjs/standard_fonts/',
        wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/',
      });
      loadingTask.onPassword = (updatePassword, reason) => {
        if (!active) return;
        passwordCallback.current = updatePassword;
        setPassword('');
        setPasswordIncorrect(reason === PasswordResponses.INCORRECT_PASSWORD);
        setStatus('password');
      };
      const document = await loadingTask.promise;
      if (!active) return;
      passwordCallback.current = null;
      setTotal(document.numPages);
      linkService.setDocument(document);
      viewer.setDocument(document);
      viewer.pagesPromise.catch(showError);
      callbacks.current.onLoaded?.({ title: record.title, numPages: document.numPages });
      const details = await Promise.allSettled([document.getMetadata(), document.getOutline(), document.getPageLabels()]);
      if (!active) return;
      const metadata = details[0].status === 'fulfilled' ? details[0].value : null;
      const title = metadata?.info?.Title?.trim();
      if (title) callbacks.current.onLoaded?.({ title, numPages: document.numPages });
      if (details[1].status === 'fulfilled') setOutline(details[1].value || []);
      if (details[2].status === 'fulfilled') viewer.setPageLabels(details[2].value);
    }

    function showError(reason) {
      if (!active) return;
      setError(reason?.name === 'InvalidPDFException'
        ? '文件内容不完整或不是有效的 PDF，请重新导入原文件。'
        : '无法读取这份 PDF，请重新导入文件后再试。');
      setStatus('error');
    }
    openDocument().catch(showError);

    return () => {
      active = false;
      ready = false;
      clearTimeout(saveTimer);
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      viewer.setDocument(null);
      linkService.setDocument(null);
      controller.abort();
      void viewer.l10n.destroy();
      void loadingTask?.destroy();
      runtime.current = null;
      passwordCallback.current = null;
    };
  }, [record.id, record.blob]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        searchInput.current?.focus();
        searchInput.current?.select();
      } else if (event.key === 'Escape') {
        setSearchOpen(false);
        setOutlineOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!runtime.current || status !== 'ready') return;
    if (!searchOpen) {
      runtime.current.eventBus.dispatch('findbarclose', {});
      return;
    }
    findText(query);
  }, [query, searchOpen, status]);

  function findText(text, again = false, previous = false) {
    runtime.current?.eventBus.dispatch('find', {
      type: again ? 'again' : '', query: text, highlightAll: true,
      caseSensitive: false, entireWord: false, matchDiacritics: false, findPrevious: previous,
    });
  }

  function fitCurrentPage(viewer) {
    const preset = viewer.currentScaleValue;
    if (fitModes.includes(preset)) {
      viewer.update();
      viewer.currentScaleValue = preset;
    }
  }

  function goToPage(value) {
    const next = Number.parseInt(value, 10);
    if (Number.isFinite(next) && runtime.current) {
      const viewer = runtime.current.viewer;
      viewer.currentPageNumber = Math.max(1, Math.min(next, total));
      fitCurrentPage(viewer);
    }
    setPageInput(String(runtime.current?.viewer.currentPageNumber || page));
  }

  function changeZoom(direction) {
    const viewer = runtime.current?.viewer;
    if (!viewer) return;
    const next = Math.round(Math.min(4, Math.max(0.25, viewer.currentScale * (direction > 0 ? 1.2 : 1 / 1.2))) * 100) / 100;
    viewer.currentScaleValue = String(next);
  }

  function navigateOutline(destination) {
    const current = runtime.current;
    current?.linkService.goToDestination(destination).then(() => {
      if (runtime.current === current) fitCurrentPage(current.viewer);
    }).catch(() => callbacks.current.onToast?.('无法跳转到这个目录位置'));
    if (window.matchMedia('(max-width: 760px)').matches) setOutlineOpen(false);
  }

  const ready = status === 'ready';
  const customZoom = !fitModes.includes(scaleValue) && !zoomLevels.includes(scaleValue);
  const findLabel = !query ? '' : matches.total > 0 ? `${matches.current} / ${matches.total}`
    : findState === FindState.PENDING ? '正在查找…' : '未找到文字';

  return <section className="pdf-reader" aria-label="PDF 阅读器">
    <div className="pdf-toolbar" role="toolbar" aria-label="PDF 阅读工具">
      <div className="pdf-page-controls">
        <span className="pdf-format"><FilePdf size={17} weight="light" />PDF</span>
        <button className="icon-button" type="button" title="上一页" aria-label="上一页" disabled={!ready || page <= 1} onClick={() => goToPage(page - 1)}><CaretLeft size={18} /></button>
        <form className="pdf-page-number" onSubmit={(event) => { event.preventDefault(); goToPage(pageInput); }}>
          <input type="number" min="1" max={total || 1} inputMode="numeric" aria-label="页码" value={pageInput} disabled={!ready} onFocus={(event) => event.target.select()} onChange={(event) => setPageInput(event.target.value)} onBlur={() => goToPage(pageInput)} />
          <span>/ {total || '—'}</span>
        </form>
        <button className="icon-button" type="button" title="下一页" aria-label="下一页" disabled={!ready || page >= total} onClick={() => goToPage(page + 1)}><CaretRight size={18} /></button>
      </div>
      <div className="pdf-zoom-controls">
        <button className="icon-button" type="button" title="缩小" aria-label="缩小" disabled={!ready || scale <= 0.25} onClick={() => changeZoom(-1)}><Minus size={17} /></button>
        <select aria-label="PDF 缩放" value={scaleValue} disabled={!ready} onChange={(event) => { runtime.current.viewer.currentScaleValue = event.target.value; }}>
          <option value="page-width">适合宽度</option>
          <option value="page-fit">整页显示</option>
          {customZoom && <option value={scaleValue}>{Math.round(scale * 100)}%</option>}
          {zoomLevels.map((level) => <option key={level} value={level}>{Number(level) * 100}%</option>)}
        </select>
        <button className="icon-button" type="button" title="放大" aria-label="放大" disabled={!ready || scale >= 4} onClick={() => changeZoom(1)}><Plus size={17} /></button>
        <button className="icon-button pdf-rotate" type="button" title="顺时针旋转" aria-label="顺时针旋转" disabled={!ready} onClick={() => { runtime.current.viewer.pagesRotation = (runtime.current.viewer.pagesRotation + 90) % 360; }}><ArrowClockwise size={18} /></button>
      </div>
      <div className="pdf-tool-actions">
        <button className={`icon-button ${searchOpen ? 'active' : ''}`} type="button" title="查找文字 · Ctrl / ⌘ F" aria-label="查找 PDF 文字" aria-pressed={searchOpen} disabled={!ready} onClick={() => setSearchOpen(!searchOpen)}><MagnifyingGlass size={19} weight="light" /></button>
        <button className={`icon-button ${outlineOpen ? 'active' : ''}`} type="button" title={outline.length ? '文档目录' : '此 PDF 没有内置目录'} aria-label="PDF 文档目录" aria-expanded={outlineOpen} disabled={!ready || !outline.length} onClick={() => setOutlineOpen(!outlineOpen)}><ListBullets size={20} weight="light" /></button>
      </div>
    </div>

    {searchOpen && <div className="pdf-search-bar" role="search">
      <MagnifyingGlass size={17} />
      <input ref={searchInput} type="search" aria-label="在 PDF 中查找" placeholder="在 PDF 中查找文字" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); findText(query, true, event.shiftKey); }
      }} />
      <span className="pdf-search-count" role="status" aria-live="polite">{findLabel}</span>
      <button type="button" className="icon-button" title="上一个结果" aria-label="上一个结果" disabled={!query || !matches.total} onClick={() => findText(query, true, true)}><CaretLeft size={17} /></button>
      <button type="button" className="icon-button" title="下一个结果" aria-label="下一个结果" disabled={!query || !matches.total} onClick={() => findText(query, true)}><CaretRight size={17} /></button>
      <button type="button" className="icon-button" title="关闭查找" aria-label="关闭查找" onClick={() => setSearchOpen(false)}><X size={17} /></button>
    </div>}

    <div className="pdf-body">
      <div className="pdf-stage">
        <div ref={container} className="pdf-scroll-container" data-fit={scaleValue} tabIndex={0} aria-label="PDF 页面" aria-busy={status === 'loading'}>
          <div ref={pages} className="pdfViewer" />
        </div>
        {status === 'loading' && <div className="pdf-state" role="status"><CircleNotch size={28} weight="light" className="pdf-spinner" /><span>正在展开文档…</span></div>}
        {status === 'password' && <div className="pdf-state">
          <form className="pdf-password" onSubmit={(event) => { event.preventDefault(); setStatus('loading'); passwordCallback.current?.(password); setPassword(''); }}>
            <LockKey size={34} weight="light" />
            <h2>这份 PDF 已设置密码</h2>
            <p>输入文档密码，继续阅读。</p>
            <input type="password" autoFocus autoComplete="off" aria-label="文档密码" placeholder="文档密码" value={password} onChange={(event) => setPassword(event.target.value)} />
            {passwordIncorrect && <span className="pdf-password-error" role="alert">密码不正确，请重试。</span>}
            <button className="pdf-unlock" type="submit" disabled={!password}>打开文档</button>
          </form>
        </div>}
        {status === 'error' && <div className="pdf-state pdf-error" role="alert"><WarningCircle size={32} weight="light" /><h2>未能打开这份 PDF</h2><p>{error}</p></div>}
      </div>

      {outlineOpen && <>
        <button className="pdf-outline-backdrop" type="button" aria-label="关闭 PDF 目录" onClick={() => setOutlineOpen(false)} />
        <aside className="pdf-outline" aria-label="PDF 目录">
          <header><span>文档目录</span><button className="icon-button" type="button" aria-label="关闭 PDF 目录" onClick={() => setOutlineOpen(false)}><X size={16} /></button></header>
          <nav><OutlineItems items={outline} onNavigate={navigateOutline} /></nav>
        </aside>
      </>}
    </div>
    <footer className="pdf-footer"><span>{ready ? `第 ${page} 页，共 ${total} 页` : 'PDF 文档'}</span><span>原版排版<span className="pdf-footer-dot">·</span>进度保存在本机</span></footer>
  </section>;
}
