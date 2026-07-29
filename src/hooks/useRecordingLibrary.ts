import { useCallback, useEffect, useState } from 'react'
import {
  bundledToMeta,
  deleteRecording,
  formatBytes,
  getRecording,
  getRollingBufferStats,
  listRecordings,
  loadBundledManifest,
  lockRecording,
  saveRecording,
  type RecordingMeta,
  type RollingBufferStats,
} from '../recording/library'
import { downloadBlob } from '../recording/recordVideo'

export function useRecordingLibrary(refreshKey = 0) {
  const [items, setItems] = useState<RecordingMeta[]>([])
  const [bufferStats, setBufferStats] = useState<RollingBufferStats>({
    segmentCount: 0,
    durationMs: 0,
    sizeBytes: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [local, bundled, stats] = await Promise.all([
        listRecordings(),
        loadBundledManifest(),
        getRollingBufferStats(),
      ])
      const bundledMeta = bundled.map(bundledToMeta)
      const localIds = new Set(local.map((r) => r.id))
      setItems([
        ...bundledMeta.filter((b) => !localIds.has(b.id)),
        ...local,
      ])
      setBufferStats(stats)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Kunne ikke hente opptaksbibliotek.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, refreshKey])

  const remove = useCallback(
    async (id: string) => {
      if (id.startsWith('bundled:')) return
      await deleteRecording(id)
      await refresh()
    },
    [refresh],
  )

  const importFile = useCallback(
    async (file: File, note?: string) => {
      const meta = await saveRecording({
        blob: file,
        name: file.name,
        note,
      })
      await refresh()
      return meta
    },
    [refresh],
  )

  const lock = useCallback(
    async (id: string) => {
      if (id.startsWith('bundled:')) return
      await lockRecording(id)
      await refresh()
    },
    [refresh],
  )

  const exportRecording = useCallback(async (id: string) => {
    if (id.startsWith('bundled:')) {
      const list = await loadBundledManifest()
      const clip = list.find((c) => `bundled:${c.id}` === id)
      if (!clip) throw new Error('Fant ikke bundlet opptak.')
      const res = await fetch(`/opptak/${clip.file}`)
      if (!res.ok) throw new Error('Kunne ikke hente bundlet fil.')
      const blob = await res.blob()
      downloadBlob(blob, clip.file)
      return
    }
    const row = await getRecording(id)
    if (!row) throw new Error('Opptak finnes ikke.')
    downloadBlob(row.blob, row.name)
  }, [])

  const resolvePlaybackSource = useCallback(
    async (
      id: string,
    ): Promise<{ url: string; revoke: boolean; name: string } | null> => {
      if (id.startsWith('bundled:')) {
        const list = await loadBundledManifest()
        const clip = list.find((c) => `bundled:${c.id}` === id)
        if (!clip) return null
        return {
          url: `/opptak/${clip.file}`,
          revoke: false,
          name: clip.name,
        }
      }
      const row = await getRecording(id)
      if (!row) return null
      return {
        url: URL.createObjectURL(row.blob),
        revoke: true,
        name: row.name,
      }
    },
    [],
  )

  return {
    items,
    bufferStats,
    loading,
    error,
    refresh,
    remove,
    lock,
    importFile,
    exportRecording,
    resolvePlaybackSource,
    formatBytes,
  }
}
