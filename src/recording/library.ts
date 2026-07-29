/** Lokalt opptaksbibliotek i IndexedDB — brukes til avspilling og deling. */

const DB_NAME = 'dashcam-norge'
const DB_VERSION = 1
const STORE = 'recordings'

export interface RecordingMeta {
  id: string
  name: string
  createdAt: number
  durationMs: number
  size: number
  mimeType: string
  /** Valgfri merkelapp (f.eks. «bensin», «skilt») */
  note?: string
  /** Bundlet eksempel fra /opptak/ — ikke slettbar fra IndexedDB */
  bundled?: boolean
  sourceUrl?: string
}

export interface StoredRecording extends RecordingMeta {
  blob: Blob
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () =>
      reject(req.error ?? new Error('Kunne ikke åpne opptaksdatabase.'))
  })
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () =>
      reject(req.error ?? new Error('IndexedDB-forespørsel feilet.'))
  })
}

export async function listRecordings(): Promise<RecordingMeta[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const rows = await idbReq(store.getAll() as IDBRequest<StoredRecording[]>)
    return rows
      .map(({ blob: _blob, ...meta }) => meta)
      .sort((a, b) => b.createdAt - a.createdAt)
  } finally {
    db.close()
  }
}

export async function getRecording(id: string): Promise<StoredRecording | null> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const row = await idbReq(
      tx.objectStore(STORE).get(id) as IDBRequest<StoredRecording | undefined>,
    )
    return row ?? null
  } finally {
    db.close()
  }
}

export async function saveRecording(input: {
  blob: Blob
  name: string
  durationMs?: number
  note?: string
  id?: string
}): Promise<RecordingMeta> {
  const id =
    input.id ??
    `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const meta: RecordingMeta = {
    id,
    name: input.name,
    createdAt: Date.now(),
    durationMs: input.durationMs ?? 0,
    size: input.blob.size,
    mimeType: input.blob.type || 'video/webm',
    note: input.note,
  }
  const row: StoredRecording = { ...meta, blob: input.blob }

  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).put(row))
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () =>
        reject(tx.error ?? new Error('Kunne ikke lagre opptak.'))
    })
  } finally {
    db.close()
  }
  return meta
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).delete(id))
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () =>
        reject(tx.error ?? new Error('Kunne ikke slette opptak.'))
    })
  } finally {
    db.close()
  }
}

export async function updateRecordingNote(
  id: string,
  note: string,
): Promise<void> {
  const existing = await getRecording(id)
  if (!existing) throw new Error('Opptak finnes ikke.')
  await saveRecording({
    id: existing.id,
    blob: existing.blob,
    name: existing.name,
    durationMs: existing.durationMs,
    note,
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface BundledClip {
  id: string
  name: string
  file: string
  note?: string
  durationMs?: number
}

export async function loadBundledManifest(): Promise<BundledClip[]> {
  try {
    const res = await fetch('/opptak/manifest.json', { cache: 'no-store' })
    if (!res.ok) return []
    const data = (await res.json()) as { clips?: BundledClip[] }
    return Array.isArray(data.clips) ? data.clips : []
  } catch {
    return []
  }
}

export function bundledToMeta(clip: BundledClip): RecordingMeta {
  return {
    id: `bundled:${clip.id}`,
    name: clip.name,
    createdAt: 0,
    durationMs: clip.durationMs ?? 0,
    size: 0,
    mimeType: 'video/webm',
    note: clip.note,
    bundled: true,
    sourceUrl: `/opptak/${clip.file}`,
  }
}
