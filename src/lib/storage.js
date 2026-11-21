import { createStore, del, get, set, update } from 'idb-keyval';
import { sampleDocuments } from './samples';

const store = createStore('leaf-reader', 'documents');
const indexKey = 'library';
const documentKey = id => `document:${id}`;

function metadata(record) {
  const { id, name, title, format, size, addedAt, openedAt, isSample, encoding } = record;
  return { id, name, title, format, size, addedAt, openedAt, isSample, encoding };
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
  await set(documentKey(saved.id), saved, store);
  await update(indexKey, (documents = []) => {
    return [metadata(saved), ...documents.filter(item => item.id !== saved.id)];
  }, store);
  return saved;
}

export async function removeDocument(id) {
  await update(indexKey, (documents = []) => documents.filter(item => item.id !== id), store);
  await del(documentKey(id), store);
}

export async function updateDocumentMetadata(id, patch) {
  const record = await getDocument(id);
  const saved = await saveDocument({ ...record, ...patch, id });
  return metadata(saved);
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
