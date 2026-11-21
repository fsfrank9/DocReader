import { useCallback, useEffect, useRef, useState } from 'react';
import { updateDocumentContent } from './storage.js';

const sameDraft = (a, b) => a === b || Boolean(a && b && a.id === b.id && a.name === b.name && a.text === b.text && a.format === b.format);

export function useDocumentEditor({ onSaved } = {}) {
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState('saved');
  const [error, setError] = useState('');
  const current = useRef(null);
  const persisted = useRef(null);
  const savedRecord = useRef(null);
  const writing = useRef(null);
  const saving = useRef(null);
  const timer = useRef(null);
  const session = useRef(0);
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (saving.current) return saving.current;

    const task = async () => {
      while (current.current && !sameDraft(current.current, persisted.current)) {
        const snapshot = current.current;
        const editingSession = session.current;
        writing.current = snapshot;
        setStatus('saving');
        setError('');
        try {
          const record = await updateDocumentContent(snapshot.id, snapshot);
          writing.current = null;
          if (editingSession !== session.current) continue;
          if (!record) throw new Error('这份文档已从书架移除');
          persisted.current = snapshot;
          savedRecord.current = record;
          await savedCallback.current?.(record);
        } catch (cause) {
          writing.current = null;
          if (editingSession !== session.current) continue;
          const message = `文档未能保存：${cause.message}`;
          setError(message);
          setStatus('error');
          throw new Error(message, { cause });
        }
      }
      setStatus('saved');
      setError('');
      return savedRecord.current;
    };

    saving.current = task().finally(() => { saving.current = null; });
    return saving.current;
  }, []);

  const begin = useCallback((record, text, format) => {
    clearTimeout(timer.current);
    session.current += 1;
    const initial = { id: record.id, name: record.name, text, format: format || record.format };
    current.current = initial;
    persisted.current = initial;
    savedRecord.current = record;
    setDraft(initial);
    setStatus('saved');
    setError('');
  }, []);

  const change = useCallback((patch) => {
    if (!current.current) return;
    const next = { ...current.current, ...patch };
    if (sameDraft(next, current.current)) return;
    current.current = next;
    setDraft(next);
    setStatus(saving.current ? 'saving' : sameDraft(next, persisted.current) ? 'saved' : 'pending');
    setError('');
  }, []);

  const end = useCallback(() => {
    clearTimeout(timer.current);
    session.current += 1;
    current.current = null;
    persisted.current = null;
    savedRecord.current = null;
    setDraft(null);
    setStatus('saved');
    setError('');
  }, []);

  useEffect(() => {
    if (draft && !sameDraft(draft, persisted.current)) {
      timer.current = setTimeout(() => { flush().catch(() => {}); }, 600);
    }
    return () => clearTimeout(timer.current);
  }, [draft, flush]);

  useEffect(() => {
    const save = () => { flush().catch(() => {}); };
    const hidden = () => { if (document.visibilityState === 'hidden') save(); };
    const leaving = (event) => {
      const value = current.current;
      const unsaved = value && (!sameDraft(value, persisted.current) || (writing.current?.id === value.id && !sameDraft(value, writing.current)));
      if (!unsaved) return;
      save();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('beforeunload', leaving);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('beforeunload', leaving);
    };
  }, [flush]);

  return { draft, status, error, begin, change, flush, end };
}
