import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import { tasklist } from '@mdit/plugin-tasklist';
import { katex } from '@mdit/plugin-katex';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';
import { decodeText } from './encoding.js';

export const SUPPORTED_EXTENSIONS = [
  '.txt', '.md', '.markdown', '.mdown', '.pdf', '.html', '.htm', '.docx', '.json', '.csv', '.tsv', '.log', '.text',
];

const formatAliases = { markdown: 'md', mdown: 'md', htm: 'html', text: 'txt' };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function highlight(code, language) {
  return language && hljs.getLanguage(language)
    ? hljs.highlight(code, { language, ignoreIllegals: true }).value
    : escapeHtml(code);
}

const markdown = new MarkdownIt({ html: true, linkify: true, breaks: false, typographer: false, highlight })
  .use(footnote)
  .use(tasklist, { disabled: true, label: false })
  .use(katex, { delimiters: 'all', mathFence: true });

const slugify = (text) => text.normalize('NFKC').toLowerCase().trim()
  .replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').replace(/-+/g, '-') || 'section';

function addHeadings(body, title) {
  const headings = [];
  const used = new Set();
  const anchors = new Map();
  const firstNode = (element) => [...element.childNodes].find((node) => (
    node.nodeType === 1 ? !['STYLE', 'SCRIPT'].includes(node.tagName) : node.nodeType === 3 && node.textContent.trim()
  ));
  let firstContent = firstNode(body);
  while (firstContent && ['DIV', 'ARTICLE', 'MAIN', 'SECTION', 'HEADER'].includes(firstContent.tagName)) {
    firstContent = firstNode(firstContent);
  }

  body.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    const text = heading.textContent.trim();
    const slug = slugify(text);
    let originalSlug = slug;
    let suffix = 1;
    while (used.has(originalSlug)) originalSlug = `${slug}-${suffix++}`;
    used.add(originalSlug);
    const id = `section-${originalSlug}`;
    if (heading.id) anchors.set(heading.id, id);
    anchors.set(originalSlug, id);
    heading.id = id;

    if (heading === firstContent && heading.tagName === 'H1') {
      title = text || title;
      const anchor = document.createElement('span');
      anchor.id = id;
      anchor.className = 'document-title-anchor';
      heading.replaceWith(anchor);
    } else {
      headings.push({ id, text, level: Number(heading.tagName[1]) });
    }
  });

  body.querySelectorAll('a[href^="#"]').forEach((link) => {
    const target = decodePath(link.getAttribute('href').slice(1));
    if (anchors.has(target)) link.setAttribute('href', `#${anchors.get(target)}`);
  });
  return { title, headings };
}

function addReadingControls(body) {
  body.querySelectorAll('pre').forEach((pre) => {
    if (pre.firstChild?.nodeType === 3 && pre.firstChild.textContent.startsWith('\n')) {
      const span = document.createElement('span');
      span.append(...pre.childNodes);
      pre.append(span);
    }
  });

  body.querySelectorAll('pre > code').forEach((code) => {
    const pre = code.parentElement;
    const language = code.className.match(/language-([^\s]+)/)?.[1] || 'text';
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';
    const label = document.createElement('span');
    label.textContent = language;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.copyCode = '';
    button.textContent = '复制';
    button.setAttribute('aria-label', '复制代码');
    toolbar.append(label, button);
    pre.replaceWith(wrapper);
    wrapper.append(toolbar, pre);
    code.classList.add('hljs');
  });

  body.querySelectorAll('table').forEach((table) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', '表格，可横向滚动');
    table.replaceWith(wrapper);
    wrapper.append(table);
  });

  body.querySelectorAll('a[href]').forEach((link) => {
    if (/^(?:https?:)?\/\//i.test(link.getAttribute('href'))) {
      if (link.getAttribute('href').startsWith('//')) link.href = `${location.protocol}${link.getAttribute('href')}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  });
}

function decodePath(path) {
  try { return decodeURIComponent(path); } catch { return path; }
}

function resolveImages(body, name, assets) {
  const files = new Map();
  const basenames = new Map();
  const urls = new Map();
  for (const asset of assets) {
    const path = asset.name.replace(/\\/g, '/').replace(/^\.\//, '');
    files.set(path, asset);
    const basename = path.split('/').pop();
    basenames.set(basename, basenames.has(basename) ? null : asset);
  }

  const documentPath = name.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  const base = new URL(documentPath, 'https://leaf.local/');
  body.querySelectorAll('img[src]').forEach((image) => {
    const source = image.getAttribute('src');
    image.loading = 'lazy';
    image.decoding = 'async';
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(source)) return;
    const path = decodePath(new URL(source, base).pathname.slice(1));
    const asset = files.get(path) || basenames.get(path.split('/').pop());
    if (!asset) return;
    if (!urls.has(asset)) urls.set(asset, URL.createObjectURL(asset.blob));
    image.src = urls.get(asset);
  });
  return [...urls.values()];
}

function readingStats(text) {
  const chinese = text.match(/\p{Script=Han}/gu)?.length || 0;
  const words = chinese + (text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length || 0);
  return { words, minutes: Math.max(1, Math.ceil(words / 350)) };
}

function readableText(body) {
  const content = body.cloneNode(true);
  content.querySelectorAll('.code-toolbar, .katex-mathml, script, style').forEach((node) => node.remove());
  content.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
  content.querySelectorAll('td, th').forEach((node) => node.append('\t'));
  content.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, tr, div').forEach((node) => node.append('\n'));
  return content.textContent;
}

async function renderDelimited(text, format) {
  if (!text) return '';
  const { default: Papa } = await import('papaparse');
  const { data } = Papa.parse(text, { delimiter: format === 'tsv' ? '\t' : '', skipEmptyLines: false });
  const last = data.at(-1);
  if (/[\r\n]$/.test(text) && last.length === 1 && last[0] === '') data.pop();
  if (!data.length) return '';
  const cells = (row, tag) => row.map((cell) => `<${tag}>${escapeHtml(cell).replace(/\r\n?|\n/g, '<br>')}</${tag}>`).join('');
  return `<table><thead><tr>${cells(data[0], 'th')}</tr></thead><tbody>${data.slice(1).map((row) => `<tr>${cells(row, 'td')}</tr>`).join('')}</tbody></table>`;
}

export async function parseDocument({ name, blob, encoding = 'auto', assets = [] }) {
  const extension = name.split('.').pop().toLowerCase();
  const format = formatAliases[extension] || extension;
  let title = name.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  let text;
  let html;
  let resolvedEncoding;

  if (format === 'docx') {
    const { default: mammoth } = await import('mammoth/mammoth.browser.js');
    const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
    html = result.value;
    text = readableText(new DOMParser().parseFromString(html, 'text/html').body).trim();
    resolvedEncoding = 'unicode';
  } else {
    ({ text, encoding: resolvedEncoding } = await decodeText(blob, encoding));
    if (format === 'md') html = markdown.render(text);
    else if (format === 'html') {
      const source = new DOMParser().parseFromString(text, 'text/html');
      title = source.title || title;
      html = source.body.innerHTML;
    } else if (format === 'json') {
      const formatted = JSON.stringify(JSON.parse(text), null, 2);
      html = `<pre><code class="language-json">${highlight(formatted, 'json')}</code></pre>`;
    } else if (format === 'csv' || format === 'tsv') html = await renderDelimited(text, format);
    else html = `<pre class="plain-text"><span>${escapeHtml(text)}</span></pre>`;
  }

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const { body } = parsed;
  const headingData = addHeadings(body, title);
  addReadingControls(body);
  const objectUrls = resolveImages(body, name, assets);
  const clean = DOMPurify.sanitize(body.innerHTML, {
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
  const plain = new DOMParser().parseFromString(clean, 'text/html');
  const stats = readingStats(`${headingData.title}\n${readableText(plain.body)}`);

  return {
    ...headingData,
    html: clean,
    text,
    format,
    encoding: resolvedEncoding,
    ...stats,
    objectUrls,
  };
}
