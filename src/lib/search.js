const blockSelector = 'p,li,h1,h2,h3,h4,h5,h6,td,th,pre,blockquote';
const excludedSelector = 'script,style,textarea,button,.code-toolbar,.katex-mathml';

function clearHighlights(root) {
  for (const mark of root.querySelectorAll('mark[data-leaf-search]')) {
    mark.replaceWith(...mark.childNodes);
  }
  root.normalize();
}

export function applySearch(root, query) {
  clearHighlights(root);
  const groups = [];
  let activeIndex = -1;

  const clear = () => clearHighlights(root);
  const focus = index => {
    if (!groups.length) return;
    if (activeIndex >= 0) {
      groups[activeIndex].forEach(mark => mark.classList.remove('search-hit-current'));
    }
    activeIndex = ((index % groups.length) + groups.length) % groups.length;
    const matches = groups[activeIndex];
    matches.forEach(mark => mark.classList.add('search-hit-current'));
    matches[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  if (!query.trim()) return { count: 0, focus, clear };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement.closest(excludedSelector)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let text = '';
  let lastBlock;
  let node;
  while ((node = walker.nextNode())) {
    const block = node.parentElement.closest(blockSelector) ?? root;
    if (lastBlock && block !== lastBlock) text += '\n';
    const start = text.length;
    text += node.nodeValue;
    nodes.push({ node, start, end: text.length });
    lastBlock = block;
  }

  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  const matches = [...text.matchAll(expression)].map(match => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  matches.forEach(() => groups.push([]));

  let firstMatch = 0;
  for (const entry of nodes) {
    while (firstMatch < matches.length && matches[firstMatch].end <= entry.start) firstMatch++;
    const pieces = [];
    for (let i = firstMatch; i < matches.length && matches[i].start < entry.end; i++) {
      pieces.push({
        index: i,
        start: Math.max(0, matches[i].start - entry.start),
        end: Math.min(entry.end - entry.start, matches[i].end - entry.start),
      });
    }
    if (!pieces.length) continue;

    const fragment = document.createDocumentFragment();
    let offset = 0;
    for (const piece of pieces) {
      fragment.append(document.createTextNode(entry.node.nodeValue.slice(offset, piece.start)));
      const mark = document.createElement('mark');
      mark.className = 'search-hit';
      mark.dataset.leafSearch = '';
      mark.textContent = entry.node.nodeValue.slice(piece.start, piece.end);
      fragment.append(mark);
      groups[piece.index].push(mark);
      offset = piece.end;
    }
    fragment.append(document.createTextNode(entry.node.nodeValue.slice(offset)));
    entry.node.replaceWith(fragment);
  }

  return { count: groups.length, focus, clear };
}
