import { useDashcam } from './hooks/useDashcam'
import type { AlertKind, DashcamSettings } from './types'
import './App.css'

const KIND_LABEL: Record<AlertKind, string> = {
  lane: 'Felt',
  sign: 'Skilt',
  info: 'Info',
  fuel: 'Drivstoff',
  pedestrian: 'Fotgjenger',
  police: 'Politi',
  vegvesen: 'Vegvesen',
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
  } = useDashcam()

  const toggle = <K extends keyof DashcamSettings>(key: K) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }))
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand-mark">DC</span>
          <div>
            <h1>Dashcam Norge</h1>
            <p>Felt · skilt · bensin · varsler</p>
          </div>
        </div>
        <div className="meta">
          <span className={ready ? 'pill ok' : 'pill'}>
            {ready ? 'Klar' : loadingMsg || 'Laster'}
          </span>
          {running && <span className="pill">{fps} det/s</span>}
        </div>
      </header>

      <main className="stage">
        <div className="viewport">
          <video ref={videoRef} playsInline muted autoPlay />
          <canvas ref={overlayRef} className="overlay" />
          {!running && (
            <div className="idle">
              <p>
                Monter telefonen mot veien, trykk start, og hold skjermen våken.
              </p>
              <button
                type="button"
                className="primary"
                disabled={!ready}
                onClick={() => void start()}
              >
                {ready ? 'Start kamera' : 'Laster modeller…'}
              </button>
            </div>
          )}
        </div>

        <aside className="side">
          <section className="panel">
            <h2>Kontroll</h2>
            <div className="row">
              {running ? (
                <button type="button" className="danger" onClick={stop}>
                  Stopp
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={!ready}
                  onClick={() => void start()}
                >
                  Start
                </button>
              )}
            </div>
            {error && <p className="error">{error}</p>}
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
              Varsle politi
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.alertVegvesen}
                onChange={() => toggle('alertVegvesen')}
              />
              Varsle vegvesen
            </label>
          </section>

          <section className="panel events">
            <h2>Hendelser</h2>
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
        </aside>
      </main>

      <footer className="foot">
        Kjører lokalt i nettleseren — kamera sendes ikke til server. Krever HTTPS
        (eller localhost) for kameratilgang.
      </footer>
    </div>
  )
}
