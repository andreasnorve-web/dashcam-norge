/** Lokalt opptaksbibliotek i IndexedDB — klipp + rullende segmenter. */

const DB_NAME = 'dashcam-norge'
const DB_VERSION = 2
const STORE = 'recordings'

export type RollingHours = 1 | 2 | 3 | 5

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
  /** Rullende dashcam-segment (kan overskrives) */
  rolling?: boolean
  sessionId?: string
  /** Låst — ikke slettes av rullende buffer */
  locked?: boolean
}

export interface StoredRecording extends RecordingMeta {
  blob: Blob
}

export interface RollingBufferStats {
  segmentCount: number
  durationMs: number
  sizeBytes: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
        store.createIndex('rolling', 'rolling', { unique: false })
      } else if (req.transaction) {
        const store = req.transaction.objectStore(STORE)
        if (!store.indexNames.contains('rolling')) {
          try {
            store.createIndex('rolling', 'rolling', { unique: false })
          } catch {
            /* ignore */
          }
        }
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

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    const result = await fn(store, tx)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () =>
        reject(tx.error ?? new Error('IndexedDB-transaksjon feilet.'))
      tx.onabort = () =>
        reject(tx.error ?? new Error('IndexedDB-transaksjon avbrutt.'))
    })
    return result
  } finally {
    db.close()
  }
}

export async function listRecordings(): Promise<RecordingMeta[]> {
  return withStore('readonly', async (store) => {
    const rows = await idbReq(store.getAll() as IDBRequest<StoredRecording[]>)
    return rows
      .map(({ blob: _blob, ...meta }) => meta)
      .sort((a, b) => b.createdAt - a.createdAt)
  })
}

export async function getRecording(id: string): Promise<StoredRecording | null> {
  return withStore('readonly', async (store) => {
    const row = await idbReq(
      store.get(id) as IDBRequest<StoredRecording | undefined>,
    )
    return row ?? null
  })
}

export async function saveRecording(input: {
  blob: Blob
  name: string
  durationMs?: number
  note?: string
  id?: string
  rolling?: boolean
  sessionId?: string
  locked?: boolean
  createdAt?: number
}): Promise<RecordingMeta> {
  const id =
    input.id ??
    `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const meta: RecordingMeta = {
    id,
    name: input.name,
    createdAt: input.createdAt ?? Date.now(),
    durationMs: input.durationMs ?? 0,
    size: input.blob.size,
    mimeType: input.blob.type || 'video/webm',
    note: input.note,
    rolling: input.rolling,
    sessionId: input.sessionId,
    locked: input.locked,
  }
  const row: StoredRecording = { ...meta, blob: input.blob }

  await withStore('readwrite', async (store) => {
    await idbReq(store.put(row))
  })
  return meta
}

export async function deleteRecording(id: string): Promise<void> {
  await withStore('readwrite', async (store) => {
    await idbReq(store.delete(id))
  })
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
    rolling: existing.rolling,
    sessionId: existing.sessionId,
    locked: existing.locked,
    createdAt: existing.createdAt,
  })
}

/** Lås et segment så det ikke slettes av rullende buffer. */
export async function lockRecording(id: string): Promise<void> {
  const existing = await getRecording(id)
  if (!existing) throw new Error('Opptak finnes ikke.')
  await saveRecording({
    id: existing.id,
    blob: existing.blob,
    name: existing.name,
    durationMs: existing.durationMs,
    note: existing.note ?? 'Låst',
    rolling: false,
    sessionId: existing.sessionId,
    locked: true,
    createdAt: existing.createdAt,
  })
}

export async function getRollingBufferStats(): Promise<RollingBufferStats> {
  const all = await listRecordings()
  const segments = all.filter((r) => r.rolling && !r.locked && !r.bundled)
  return {
    segmentCount: segments.length,
    durationMs: segments.reduce((s, r) => s + (r.durationMs || 0), 0),
    sizeBytes: segments.reduce((s, r) => s + (r.size || 0), 0),
  }
}

/**
 * Slett eldste rullende segmenter til samlet varighet ≤ maxDurationMs.
 * Låste/bundlete/vanlige klipp berøres ikke.
 */
export async function pruneRollingBuffer(
  maxDurationMs: number,
): Promise<number> {
  const all = await listRecordings()
  const segments = all
    .filter((r) => r.rolling && !r.locked && !r.bundled)
    .sort((a, b) => a.createdAt - b.createdAt)

  let total = segments.reduce((s, r) => s + (r.durationMs || 0), 0)
  let deleted = 0

  for (const seg of segments) {
    if (total <= maxDurationMs) break
    await deleteRecording(seg.id)
    total -= seg.durationMs || 0
    deleted += 1
  }
  return deleted
}

/** Lagre segment og håndhev rullende kvote (med retry ved full disk). */
export async function saveRollingSegment(input: {
  blob: Blob
  name: string
  durationMs: number
  sessionId: string
  maxDurationMs: number
}): Promise<RecordingMeta> {
  const payload = {
    blob: input.blob,
    name: input.name,
    durationMs: input.durationMs,
    rolling: true as const,
    sessionId: input.sessionId,
    note: 'Rullende segment',
  }

  try {
    const meta = await saveRecording(payload)
    await pruneRollingBuffer(input.maxDurationMs)
    return meta
  } catch (err) {
    // Full kvote: slett hardere og prøv igjen
    await pruneRollingBuffer(Math.floor(input.maxDurationMs * 0.5))
    const meta = await saveRecording(payload)
    await pruneRollingBuffer(input.maxDurationMs)
    if (err) {
      /* swallowed after retry */
    }
    return meta
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function rollingHoursToMs(hours: RollingHours): number {
  return hours * 60 * 60 * 1000
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
