import { useCallback, useEffect, useState } from 'react'
import {
  bundledToMeta,
  deleteRecording,
  formatBytes,
  getRecording,
  listRecordings,
  loadBundledManifest,
  saveRecording,
  type RecordingMeta,
} from '../recording/library'
import { downloadBlob } from '../recording/recordVideo'

export function useRecordingLibrary(refreshKey = 0) {
  const [items, setItems] = useState<RecordingMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [local, bundled] = await Promise.all([
        listRecordings(),
        loadBundledManifest(),
      ])
      const bundledMeta = bundled.map(bundledToMeta)
      // Unngå duplikat-id hvis noen har importert samme fil
      const localIds = new Set(local.map((r) => r.id))
      setItems([
        ...bundledMeta.filter((b) => !localIds.has(b.id)),
        ...local,
      ])
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
    loading,
    error,
    refresh,
    remove,
    importFile,
    exportRecording,
    resolvePlaybackSource,
    formatBytes,
  }
}
