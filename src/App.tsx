import { useEffect, useState } from 'react'
import { useDashcam } from './hooks/useDashcam'
import { useGpsSpeed } from './hooks/useGpsSpeed'
import type { AlertKind, DashcamSettings } from './types'
import './App.css'

const KIND_LABEL: Record<AlertKind, string> = {
  lane: 'Felt',
  sign: 'Skilt',
  info: 'Info',
  fuel: 'Bensin',
  pedestrian: 'Fotgjenger',
  police: 'Kontroll',
  vegvesen: 'Kontroll',
}

export default function App() {
  const {
    videoRef,
    overlayRef,
    running,
    ready,
    loadingMsg,
    error,
    events,
    fps,
    settings,
    setSettings,
    start,
    stop,
    iosStandalone,
  } = useDashcam()

  const [panelOpen, setPanelOpen] = useState(true)
  const [tab, setTab] = useState<'kontroll' | 'hendelser'>('hendelser')
  const { speedKmh } = useGpsSpeed(running)

  const toggle = <K extends keyof DashcamSettings>(key: K) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }))
  }

  const latest = events[0]
  const dashMode = !panelOpen

  useEffect(() => {
    if (events.length === 0) return
    setTab('hendelser')
  }, [events])

  // Når kamera starter: gå rett i full dashbordvisning
  useEffect(() => {
    if (running) setPanelOpen(false)
  }, [running])

  const handleStart = () => {
    setPanelOpen(false)
    void start()
  }

  return (
    <div
      className={`app${running ? ' app--live' : ''}${dashMode ? ' app--panel-closed' : ''}${dashMode && running ? ' app--dash' : ''}`}
    >
      <header className="top">
        <div className="brand">
          <button
            type="button"
            className={`brand-mark${running ? ' brand-mark--stop' : ' brand-mark--start'}`}
            aria-label={running ? 'Stopp kamera' : 'Start kamera'}
            onClick={() => {
              if (running) stop()
              else handleStart()
            }}
          >
            {running ? 'Stopp' : 'Start'}
          </button>
          {!dashMode && (
            <div className="brand-text">
              <h1>Dashcam Norge</h1>
              <p>Felt · skilt · bensin · varsler</p>
            </div>
          )}
        </div>
        <div className="meta">
          {!dashMode && (
            <>
              <span className={ready ? 'pill ok' : 'pill'}>
                {ready ? 'Klar' : loadingMsg || 'Laster'}
              </span>
              {running && <span className="pill">{fps} det/s</span>}
            </>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-expanded={panelOpen}
            aria-controls="side-panel"
            onClick={() => setPanelOpen((v) => !v)}
          >
            {panelOpen ? 'Skjul' : 'Meny'}
          </button>
        </div>
      </header>

      <main className="stage">
        <div className="viewport">
          <video ref={videoRef} playsInline muted autoPlay />
          <canvas ref={overlayRef} className="overlay" />

          {!running && (
            <div className="idle">
              {iosStandalone && (
                <p className="idle-warn">
                  iPhone-appmodus har ofte kameraproblemer. Hvis Start feiler:
                  åpne samme adresse i Safari i stedet.
                </p>
              )}
              <p>
                Trykk <strong>Start</strong> for fullskjerm-dashbord. Bruk Meny
                for hendelser og innstillinger.
              </p>
              {error && <p className="error idle-error">{error}</p>}
              <button type="button" className="primary" onClick={handleStart}>
                Start kamera
              </button>
              {iosStandalone && (
                <a className="safari-link" href={window.location.href}>
                  Åpne i Safari
                </a>
              )}
            </div>
          )}

          {running && (
            <>
              <div className="hud-alert">
                {error ? (
                  <div className="hud-card hud-card--urgent">
                    <span className="msg">{error}</span>
                  </div>
                ) : latest ? (
                  <div
                    className={`hud-card${latest.urgent ? ' hud-card--urgent' : ''}`}
                  >
                    <span className="kind">{KIND_LABEL[latest.kind]}</span>
                    <span className="msg">{latest.message}</span>
                  </div>
                ) : null}
              </div>

              <div className="hud-speed" aria-live="polite">
                <span className="hud-speed-value">
                  {speedKmh == null ? '—' : speedKmh}
                </span>
                <span className="hud-speed-unit">km/t</span>
              </div>
            </>
          )}
        </div>

        <aside id="side-panel" className="side" hidden={!panelOpen}>
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'hendelser'}
              className={tab === 'hendelser' ? 'tab active' : 'tab'}
              onClick={() => setTab('hendelser')}
            >
              Hendelser
              {events.length > 0 && (
                <span className="badge">{Math.min(events.length, 99)}</span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'kontroll'}
              className={tab === 'kontroll' ? 'tab active' : 'tab'}
              onClick={() => setTab('kontroll')}
            >
              Innstillinger
            </button>
          </div>

          {tab === 'hendelser' ? (
            <section className="panel events">
              <p className="events-hint">
                Skilt søkes til høyre for høyre feltlinje. Bensinpriser høyere
                opp. Kontroll/politi lavt til høyre.
              </p>
              {error && <p className="error">{error}</p>}
              {events.length === 0 ? (
                <p className="muted">Ingen deteksjoner ennå.</p>
              ) : (
                <ul>
                  {events.map((ev) => (
                    <li key={ev.id} className={ev.urgent ? 'urgent' : ''}>
                      <span className="kind">{KIND_LABEL[ev.kind]}</span>
                      <span className="msg">{ev.message}</span>
                      <time>
                        {new Date(ev.at).toLocaleTimeString('nb-NO', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="panel">
              {error && <p className="error">{error}</p>}
              <div className="checks">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.showLanes}
                    onChange={() => toggle('showLanes')}
                  />
                  Vis veibaner
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.speakSigns}
                    onChange={() => toggle('speakSigns')}
                  />
                  Les opp skilt
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.speakFuel}
                    onChange={() => toggle('speakFuel')}
                  />
                  Les opp bensinpriser
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.alertPedestrians}
                    onChange={() => toggle('alertPedestrians')}
                  />
                  Varsle fotgjengere
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.alertPolice}
                    onChange={() => toggle('alertPolice')}
                  />
                  Varsle kontroll (politi)
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.alertVegvesen}
                    onChange={() => toggle('alertVegvesen')}
                  />
                  Varsle vegvesen
                </label>
              </div>
            </section>
          )}
        </aside>
      </main>

      {!dashMode && (
        <footer className="foot">
          Kjører lokalt i nettleseren — kamera sendes ikke til server.
        </footer>
      )}
    </div>
  )
}
