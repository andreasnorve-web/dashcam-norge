import { useEffect, useState } from 'react'
import { useDashcam } from './hooks/useDashcam'
import { useGpsSpeed } from './hooks/useGpsSpeed'
import { illustrationFromEvent } from './signs/illustration'
import { SignIllustrationView } from './signs/SignIllustrationView'
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
    signHud,
    settings,
    setSettings,
    start,
    stop,
    iosStandalone,
    pwaStandalone,
  } = useDashcam()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tab, setTab] = useState<'kontroll' | 'hendelser'>('hendelser')
  const { speedKmh } = useGpsSpeed(running)

  const toggle = <K extends keyof DashcamSettings>(key: K) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }))
  }

  const latest = events[0]
  const signIllustration = signHud
    ? illustrationFromEvent(signHud.kind, signHud.message)
    : null

  useEffect(() => {
    if (events.length === 0) return
    setTab('hendelser')
  }, [events])

  useEffect(() => {
    if (running) setDrawerOpen(false)
  }, [running])

  const handleStart = () => {
    setDrawerOpen(false)
    // Start getUserMedia i samme bruker-gest — bakkamera (dashcam).
    const preflight =
      navigator.mediaDevices?.getUserMedia?.({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      }) ?? null
    void start(preflight)
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
          <button
            type="button"
            className="menu-btn"
            aria-expanded={drawerOpen}
            aria-controls="side-drawer"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            Meny
            {events.length > 0 && (
              <span className="badge">{Math.min(events.length, 99)}</span>
            )}
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
              {(iosStandalone || pwaStandalone) && (
                <div className="idle-block">
                  <p className="idle-warn">
                    Du er i installert app-modus. Kamera fungerer ikke pålitelig
                    her (iOS-begrensning). Åpne adressen i Safari/Chrome i
                    stedet, og slett hjemskjerm-ikonet.
                  </p>
                  <p className="idle-url">{window.location.origin}</p>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      const url = `${window.location.origin}/?v=browser`
                      void navigator.clipboard?.writeText(url).catch(() => {})
                      const opened = window.open(
                        url,
                        '_blank',
                        'noopener,noreferrer',
                      )
                      if (!opened) window.location.replace(url)
                    }}
                  >
                    Kopier / åpne i nettleser
                  </button>
                </div>
              )}
              {!(iosStandalone || pwaStandalone) && (
                <>
                  <p>
                    Trykk <strong>Start</strong> for fullskjerm-dashbord. Bruk{' '}
                    <strong>Meny</strong> for hendelser og innstillinger.
                  </p>
                  {error && <p className="error idle-error">{error}</p>}
                  <button
                    type="button"
                    className="primary"
                    onClick={handleStart}
                  >
                    Start kamera
                  </button>
                </>
              )}
              {(iosStandalone || pwaStandalone) && error && (
                <p className="error idle-error">{error}</p>
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
                ) : signIllustration ? (
                  <div className="hud-sign" key={signHud?.id}>
                    <SignIllustrationView illustration={signIllustration} />
                  </div>
                ) : latest &&
                  latest.kind !== 'sign' &&
                  latest.kind !== 'info' &&
                  latest.kind !== 'fuel' ? (
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
                  {events.map((ev) => {
                    const illu = illustrationFromEvent(ev.kind, ev.message)
                    return (
                      <li key={ev.id} className={ev.urgent ? 'urgent' : ''}>
                        {illu ? (
                          <div className="event-illu">
                            <SignIllustrationView illustration={illu} />
                          </div>
                        ) : (
                          <span className="kind">{KIND_LABEL[ev.kind]}</span>
                        )}
                        <span className="msg">{ev.message}</span>
                        <time>
                          {new Date(ev.at).toLocaleTimeString('nb-NO', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </time>
                      </li>
                    )
                  })}
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
