import {
  BookOpen, CaretLeft, DownloadSimple, FilePlus, FileText,
  MagnifyingGlass, Moon, Plus, Sun, Trash, X,
} from '@phosphor-icons/react';

function SidebarButton({ label, active, children, className = '', ...props }) {
  return <button type="button" className={`icon-button ${active ? 'is-active' : ''} ${className}`} title={label} aria-label={label} {...props}>{children}</button>;
}

export function LibrarySidebar({
  filtered, activeId, ready, libraryQuery, drawerOpen, offlineReady, prefs,
  onHome, onClose, onCollapse, onOpen, onNew, onChoose, onRemove,
  onQueryChange, onPreferenceChange, onInstall,
}) {
  return <aside id="document-library" className={`library ${drawerOpen ? 'drawer-open' : ''}`} aria-label="文档书架">
    <div className="brand-row">
      <button type="button" className="brand" onClick={onHome} aria-label="纸间 Leaf"><img src="/icons/icon-192.png" alt="" /><span><strong>纸间</strong><small>LEAF</small></span></button>
      <SidebarButton label="收起书架" className="library-collapse" onClick={onCollapse} aria-controls="document-library" aria-expanded="true"><CaretLeft size={19} weight="light" /></SidebarButton>
      <SidebarButton label="关闭书架" className="library-close" onClick={onClose}><X size={20} /></SidebarButton>
    </div>

    <div className="library-primary-actions">
      <button type="button" className="open-document" onClick={onOpen}><Plus size={21} weight="light" /><span>打开文档</span></button>
      <button type="button" className="new-document" onClick={onNew}><FilePlus size={20} weight="light" /><span>新建文档</span></button>
    </div>

    <label className="library-search"><MagnifyingGlass size={20} weight="light" /><input placeholder="搜索文档…" value={libraryQuery} onChange={(event) => onQueryChange(event.target.value)} aria-label="搜索书架" />{libraryQuery && <button type="button" onClick={() => onQueryChange('')} aria-label="清除书架搜索"><X size={15} /></button>}</label>
    <div className="library-heading"><span>{libraryQuery ? '搜索结果' : '最近阅读'}</span><span className="document-count">{filtered.length}</span></div>

    <nav className="document-list" aria-label="最近阅读">
      {filtered.map((item) => <div className={`document-row ${item.id === activeId ? 'selected' : ''}`} key={item.id}>
        <button type="button" className="document-open" onClick={() => onChoose(item.id)} title={item.name} aria-current={item.id === activeId ? 'page' : undefined}><FileText size={21} weight="light" /><span className="document-name">{item.name}</span></button>
        <button type="button" className="document-remove" onClick={() => onRemove(item.id)} title={`从书架移除 ${item.name}`} aria-label={`从书架移除 ${item.name}`}><Trash size={17} weight="light" /></button>
      </div>)}
      {ready && !filtered.length && <div className="library-empty">{libraryQuery ? '没有找到这份文档' : '书架还空着，打开或新建一份文档吧。'}</div>}
    </nav>

    <div className="library-bottom">
      <div className="library-note"><span className="status-dot" />{offlineReady ? '已就绪，随时离线阅读' : '一页之间，慢慢读'}</div>
      <div className="library-bottom-actions">
        <div className="theme-switcher" aria-label="阅读主题">
          <SidebarButton label="浅色主题" active={prefs.theme === 'light'} aria-pressed={prefs.theme === 'light'} onClick={() => onPreferenceChange('theme', 'light')}><Sun size={19} weight="light" /></SidebarButton>
          <SidebarButton label="纸色主题" active={prefs.theme === 'paper'} aria-pressed={prefs.theme === 'paper'} onClick={() => onPreferenceChange('theme', 'paper')}><BookOpen size={19} weight="light" /></SidebarButton>
          <SidebarButton label="深色主题" active={prefs.theme === 'dark'} aria-pressed={prefs.theme === 'dark'} onClick={() => onPreferenceChange('theme', 'dark')}><Moon size={19} weight="light" /></SidebarButton>
        </div>
        <SidebarButton label="安装纸间" onClick={onInstall}><DownloadSimple size={19} weight="light" /></SidebarButton>
      </div>
    </div>
  </aside>;
}
