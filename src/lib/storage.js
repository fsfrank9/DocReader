import { createStore, get, promisifyRequest, set } from 'idb-keyval';
import { sampleDocuments } from './samples';

const store = createStore('leaf-reader', 'documents');
const indexKey = 'library';
const documentKey = id => `document:${id}`;
const formatAliases = { markdown: 'md', mdown: 'md', text: 'txt', htm: 'html' };
const textTypes = {
  md: 'text/markdown', txt: 'text/plain', log: 'text/plain', html: 'text/html',
  json: 'application/json', csv: 'text/csv', tsv: 'text/tab-separated-values',
};

function metadata(record) {
  const { id, name, title, format, size, addedAt, openedAt, updatedAt, isSample, encoding } = record;
  return { id, name, title, format, size, addedAt, openedAt, updatedAt, isSample, encoding };
}

function changeDocument(id, updater) {
  return store('readwrite', (objectStore) => {
    const done = promisifyRequest(objectStore.transaction);
    const changed = Promise.all([
      promisifyRequest(objectStore.get(documentKey(id))),
      promisifyRequest(objectStore.get(indexKey)),
    ]).then(([current, documents = []]) => {
      const saved = updater(current);
      if (saved !== undefined) {
        const remaining = documents.filter(item => item.id !== id);
        if (saved === null) objectStore.delete(documentKey(id));
        else objectStore.put(saved, documentKey(id));
        objectStore.put(saved === null ? remaining : [metadata(saved), ...remaining], indexKey);
      }
      return saved;
    });
    return Promise.all([changed, done]).then(([saved]) => saved);
  });
}

function textContent(name, text, format) {
  format = formatAliases[format] || format;
  name = name.trim() || '未命名文档';
  const extension = name.match(/\.([^.]+)$/)?.[1].toLowerCase();
  const nameFormat = formatAliases[extension] || extension;
  if (nameFormat !== format) {
    name = `${textTypes[nameFormat] ? name.replace(/\.[^.]+$/, '') : name}.${format}`;
  }
  if (!name.replace(/\.[^.]+$/, '').trim()) name = `未命名文档${name.slice(name.lastIndexOf('.'))}`;
  const blob = new Blob([text], { type: `${textTypes[format]};charset=utf-8` });
  return { name, title: name.replace(/\.[^.]+$/, ''), format, blob, size: blob.size, encoding: 'utf-8' };
}

export async function listDocuments() {
  const documents = (await get(indexKey, store)) ?? [];
  return documents.sort((a, b) => b.openedAt - a.openedAt);
}

export function getDocument(id) {
  return get(documentKey(id), store);
}

export async function saveDocument(record) {
  const saved = {
    assets: [],
    encoding: 'auto',
    addedAt: Date.now(),
    openedAt: Date.now(),
    isSample: false,
    ...record,
  };
  return changeDocument(saved.id, () => saved);
}

export function removeDocument(id) {
  return changeDocument(id, () => null);
}

export async function updateDocumentMetadata(id, patch) {
  const saved = await changeDocument(id, current => current && { ...current, ...patch, id });
  return saved ? metadata(saved) : undefined;
}

export function createTextDocument({ name = '未命名文档', format = 'md', content = '' } = {}) {
  const now = Date.now();
  return saveDocument({
    id: crypto.randomUUID(),
    ...textContent(name, content, format),
    addedAt: now, openedAt: now, updatedAt: now,
  });
}

export function updateDocumentContent(id, { name, text, format }) {
  return changeDocument(id, current => {
    if (!current) return;
    const extension = name?.match(/\.([^.]+)$/)?.[1].toLowerCase();
    const nameFormat = formatAliases[extension] || extension;
    return {
      ...current,
      ...textContent(name ?? current.name, text, format || (textTypes[nameFormat] ? nameFormat : current.format)),
      updatedAt: Date.now(),
      isSample: false,
    };
  });
}

let seeding;

export function ensureSamples() {
  seeding ??= seedSamples();
  return seeding;
}

async function seedSamples() {
  if (await get('seeded', store)) return listDocuments();

  if ((await get(indexKey, store)) === undefined) {
    const now = Date.now();
    for (const [index, sample] of sampleDocuments.entries()) {
      const blob = new Blob([sample.content], { type: sample.type });
      const extension = sample.name.split('.').pop().toLowerCase();
      await saveDocument({
        id: sample.id,
        name: sample.name,
        title: sample.name.replace(/\.[^.]+$/, ''),
        format: extension,
        size: blob.size,
        addedAt: now - index,
        openedAt: now - index,
        isSample: true,
        blob,
      });
    }
  }

  await set('seeded', true, store);
  return listDocuments();
}
