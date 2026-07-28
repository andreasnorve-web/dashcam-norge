import { useEffect, useState } from 'react'

/** GPS-hastighet i km/t (null hvis utilgjengelig). */
export function useGpsSpeed(enabled: boolean) {
  const [speedKmh, setSpeedKmh] = useState<number | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) {
      setSpeedKmh(null)
      return
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null)
        const ms = pos.coords.speed
        if (ms == null || Number.isNaN(ms) || ms < 0) {
          setSpeedKmh(0)
          return
        }
        setSpeedKmh(Math.round(ms * 3.6))
      },
      (err) => {
        setGpsError(err.message)
        setSpeedKmh(null)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      },
    )

    return () => navigator.geolocation.clearWatch(id)
  }, [enabled])

  return { speedKmh, gpsError }
}
