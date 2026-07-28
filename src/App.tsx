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
    settings,
    setSettings,
    start,
    stop,
    iosStandalone,
  } = useDashcam()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tab, setTab] = useState<'kontroll' | 'hendelser'>('hendelser')
  const { speedKmh } = useGpsSpeed(running)

  const toggle = <K extends keyof DashcamSettings>(key: K) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }))
  }

  const latest = events[0]
  const latestSign = events.find(
    (e) =>
      (e.kind === 'sign' || e.kind === 'info' || e.kind === 'fuel') &&
      e.imageDataUrl,
  )
  const showSignImage =
    latestSign &&
    (!latest ||
      latest.kind === 'sign' ||
      latest.kind === 'info' ||
      latest.kind === 'fuel' ||
      Date.now() - latestSign.at < 8000)

  useEffect(() => {
    if (events.length === 0) return
    setTab('hendelser')
  }, [events])

  useEffect(() => {
    if (running) setDrawerOpen(false)
  }, [running])

  const handleStart = () => {
    setDrawerOpen(false)
    void start()
  }

  const openDrawer = (nextTab?: 'hendelser' | 'kontroll') => {
    if (nextTab) setTab(nextTab)
    setDrawerOpen(true)
  }

  return (
    <div className={`app${running ? ' app--live app--dash' : ''}`}>
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
          {!running && (
            <div className="brand-text">
              <h1>Dashcam Norge</h1>
              <p>Felt · skilt · bensin · varsler</p>
            </div>
          )}
        </div>
        {!running && (
          <div className="meta">
            <span className={ready ? 'pill ok' : 'pill'}>
              {ready ? 'Klar' : loadingMsg || 'Laster'}
            </span>
          </div>
        )}
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
                Trykk <strong>Start</strong> for fullskjerm-dashbord. Åpne
                panelet via fanen til høyre for hendelser og innstillinger.
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
                ) : showSignImage && latestSign?.imageDataUrl ? (
                  <div className="hud-sign">
                    <img
                      src={latestSign.imageDataUrl}
                      alt={latestSign.message}
                      className="hud-sign-img"
                    />
                    {latestSign.message !== 'Skilt' &&
                      latestSign.message !== 'Info' &&
                      latestSign.message !== 'Prisskilt' && (
                        <span className="hud-sign-caption">
                          {latestSign.message}
                        </span>
                      )}
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

        {/* Kant-fane til høyre — åpner skuff */}
        <div className="edge-tabs" aria-hidden={drawerOpen}>
          <button
            type="button"
            className="edge-tab"
            aria-expanded={drawerOpen}
            aria-controls="side-drawer"
            onClick={() => openDrawer('hendelser')}
          >
            <span className="edge-tab-label">Hendelser</span>
            {events.length > 0 && (
              <span className="badge">{Math.min(events.length, 99)}</span>
            )}
          </button>
          <button
            type="button"
            className="edge-tab"
            aria-expanded={drawerOpen}
            aria-controls="side-drawer"
            onClick={() => openDrawer('kontroll')}
          >
            <span className="edge-tab-label">Innstillinger</span>
          </button>
        </div>

        {drawerOpen && (
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="Lukk panel"
            onClick={() => setDrawerOpen(false)}
          />
        )}

        <aside
          id="side-drawer"
          className={`drawer${drawerOpen ? ' drawer--open' : ''}`}
          aria-hidden={!drawerOpen}
        >
          <div className="drawer-head">
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
            <button
              type="button"
              className="drawer-close"
              onClick={() => setDrawerOpen(false)}
            >
              Lukk
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
                      {ev.imageDataUrl ? (
                        <img
                          src={ev.imageDataUrl}
                          alt=""
                          className="event-thumb"
                        />
                      ) : (
                        <span className="kind">{KIND_LABEL[ev.kind]}</span>
                      )}
                      <span className="msg">
                        {ev.imageDataUrl &&
                        (ev.message === 'Skilt' ||
                          ev.message === 'Info' ||
                          ev.message === 'Prisskilt')
                          ? KIND_LABEL[ev.kind]
                          : ev.message}
                      </span>
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

      {!running && (
        <footer className="foot">
          Kjører lokalt i nettleseren — kamera sendes ikke til server.
        </footer>
      )}
    </div>
  )
}
