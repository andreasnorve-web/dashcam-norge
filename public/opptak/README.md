# Opptak for utvikling

Legg videoklipp her for å dele kjøreturer med utviklingsagenten og for
avspilling i appen (via `manifest.json`).

## Slik deler du opptak

1. Ta opptak i appen (Start → Opptak → stopp).
2. Åpne **Meny → Opptak → Eksporter**.
3. Kopier filen hit, f.eks. `bensin-vanylven-01.webm`.
4. Oppdater `manifest.json`:

```json
{
  "clips": [
    {
      "id": "bensin-01",
      "name": "Bensinpris Vanylven",
      "file": "bensin-vanylven-01.webm",
      "note": "LED-prisskilt, kveld",
      "durationMs": 12000
    }
  ]
}
```

5. Commit og push — da kan både appen og AI-agenten bruke klippet.

## Tips

- Hold klipp korte (5–30 s) rundt det som er interessant (skilt/bensin).
- WebM eller MP4 fungerer i moderne nettlesere.
- Store filer: vurder Git LFS, eller legg filene i workspace uten å committe
  store binærfiler til GitHub hvis repoet blir for tungt.
