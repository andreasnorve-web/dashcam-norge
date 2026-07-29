import { useCallback, useEffect, useState } from 'react'
import { isIosDevice, isStandaloneDisplay } from '../camera/openCamera'

const PREFER_KEY = 'dashcam-prefer-pwa'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function readPreferPwa(): boolean {
  try {
    const v = localStorage.getItem(PREFER_KEY)
    if (v === null) return true
    return v === '1'
  } catch {
    return true
  }
}

export function usePwaInstall() {
  const [preferPwa, setPreferPwaState] = useState(readPreferPwa)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [installed, setInstalled] = useState(() => isStandaloneDisplay())
  const ios = isIosDevice()

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const setPreferPwa = useCallback((value: boolean) => {
    setPreferPwaState(value)
    try {
      localStorage.setItem(PREFER_KEY, value ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return false
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    if (choice.outcome === 'accepted') setInstalled(true)
    return choice.outcome === 'accepted'
  }, [deferred])

  const openInBrowser = useCallback(() => {
    const url = `${window.location.origin}/?browser=1`
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) window.location.assign(url)
  }, [])

  const mode: 'installed' | 'installable' | 'ios-manual' | 'browser' = installed
    ? 'installed'
    : deferred
      ? 'installable'
      : ios
        ? 'ios-manual'
        : 'browser'

  const modeLabel =
    mode === 'installed'
      ? 'Kjører som app / hjemskjerm'
      : mode === 'installable'
        ? 'Kan installeres'
        : mode === 'ios-manual'
          ? 'iPhone: legg til manuelt'
          : 'Nettleser'

  return {
    preferPwa,
    setPreferPwa,
    canInstall: Boolean(deferred),
    installed,
    ios,
    mode,
    modeLabel,
    install,
    openInBrowser,
  }
}
