import { useRef, useState } from 'react'
import { formatRecordingDuration } from '../recording/recordVideo'
import { useRecordingLibrary } from '../hooks/useRecordingLibrary'
import type { RecordingMeta } from '../recording/library'

interface Props {
  libraryVersion: number
  rollingHours: number
  onPlay: (source: { url: string; name: string; revokeUrl?: boolean }) => void
}

export function RecordingLibraryPanel({
  libraryVersion,
  rollingHours,
  onPlay,
}: Props) {
  const {
    items,
    bufferStats,
    loading,
    error,
    remove,
    lock,
    importFile,
    exportRecording,
    resolvePlaybackSource,
    formatBytes,
    refresh,
  } = useRecordingLibrary(libraryVersion)

  const fileRef = useRef<HTMLInputElement | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const play = async (item: RecordingMeta) => {
    setLocalError(null)
    setBusyId(item.id)
    try {
      const source = await resolvePlaybackSource(item.id)
      if (!source) throw new Error('Fant ikke opptaket.')
      onPlay({
        url: source.url,
        name: source.name,
        revokeUrl: source.revoke,
      })
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Kunne ikke åpne opptak.')
    } finally {
      setBusyId(null)
    }
  }

  const onImport = async (file: File | undefined) => {
    if (!file) return
    setLocalError(null)
    setBusyId('import')
    try {
      await importFile(file)
    } catch (e) {
      setLocalError(
        e instanceof Error ? e.message : 'Kunne ikke importere filen.',
      )
    } finally {
      setBusyId(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className="panel recordings">
      <p className="events-hint">
        Rullende buffer ({rollingHours} t): eldste 1-minutts segmenter slettes
        automatisk. Bruk <strong>Lås</strong> for å beholde et klipp.
      </p>
      <p className="events-hint">
        Buffer: {formatRecordingDuration(bufferStats.durationMs)} / {rollingHours}
        t · {bufferStats.segmentCount} segmenter ·{' '}
        {formatBytes(bufferStats.sizeBytes)}
      </p>

      <div className="recordings-actions">
        <button
          type="button"
          className="drawer-close"
          onClick={() => fileRef.current?.click()}
          disabled={busyId === 'import'}
        >
          Importer video
        </button>
        <button
          type="button"
          className="drawer-close"
          onClick={() => void refresh()}
        >
          Oppdater
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*,.webm,.mp4,.mov"
          hidden
          onChange={(e) => void onImport(e.target.files?.[0])}
        />
      </div>

      {(error || localError) && (
        <p className="error">{localError || error}</p>
      )}

      {loading ? (
        <p className="muted">Henter opptak…</p>
      ) : items.length === 0 ? (
        <p className="muted">
          Ingen opptak ennå. Start kamera, trykk Opptak, eller importer en
          videofil.
        </p>
      ) : (
        <ul className="recording-list">
          {items.map((item) => (
            <li key={item.id} className="recording-item">
              <div className="recording-meta">
                <strong className="recording-name">{item.name}</strong>
                <span className="recording-sub">
                  {item.bundled
                    ? 'Eksempel · '
                    : item.locked
                      ? 'Låst · '
                      : item.rolling
                        ? 'Segment · '
                        : ''}
                  {item.durationMs
                    ? `${formatRecordingDuration(item.durationMs)} · `
                    : ''}
                  {item.size > 0 ? `${formatBytes(item.size)} · ` : ''}
                  {item.createdAt
                    ? new Date(item.createdAt).toLocaleString('nb-NO', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'bundlet'}
                </span>
                {item.note && <span className="recording-note">{item.note}</span>}
              </div>
              <div className="recording-btns">
                <button
                  type="button"
                  className="rec-action rec-action--play"
                  disabled={busyId === item.id}
                  onClick={() => void play(item)}
                >
                  Spill av
                </button>
                <button
                  type="button"
                  className="rec-action"
                  disabled={busyId === item.id}
                  onClick={() =>
                    void exportRecording(item.id).catch((e) =>
                      setLocalError(
                        e instanceof Error ? e.message : 'Eksport feilet.',
                      ),
                    )
                  }
                >
                  Eksporter
                </button>
                {item.rolling && !item.locked && !item.bundled && (
                  <button
                    type="button"
                    className="rec-action"
                    disabled={busyId === item.id}
                    onClick={() =>
                      void lock(item.id).catch((e) =>
                        setLocalError(
                          e instanceof Error ? e.message : 'Lås feilet.',
                        ),
                      )
                    }
                  >
                    Lås
                  </button>
                )}
                {!item.bundled && (
                  <button
                    type="button"
                    className="rec-action rec-action--danger"
                    disabled={busyId === item.id}
                    onClick={() =>
                      void remove(item.id).catch((e) =>
                        setLocalError(
                          e instanceof Error ? e.message : 'Sletting feilet.',
                        ),
                      )
                    }
                  >
                    Slett
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
