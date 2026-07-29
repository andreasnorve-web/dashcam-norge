# Dashcam Norge

Mobilvennlig dashbordkamera i nettleseren. Gjenkjenner veibaner, trafikkskilt, informasjonsskilt og bensinpriser, leser dem opp, og varsler med lyd for fotgjengere, politi og Statens vegvesen.

## Funksjoner (MVP)

- **Veibaner** – enkel kantbasert feltgjenkjenning i nedre bildehalvdel
- **Trafikk-/info-skilt** – fargeheuristikk + OCR (norsk/engelsk)
- **Bensinpriser** – OCR på LED-/prisskilt (`Bensin 19.90` osv.)
- **Fotgjengere** – COCO-SSD (TensorFlow.js), lydvarsel + opplesing
- **Politi / vegvesen** – OCR for `POLITI`, `VEGVESEN`, `STATENS VEGVESEN` + lydvarsel
- Alt kjører **lokalt i telefonen** – video streames ikke til server
- **Videoopptak** – ta opp kjøreturen; lagres i lokalt bibliotek (IndexedDB)
- **Avspilling** – spill opptak på nytt gjennom samme skilt-/bensin-deteksjon
- **Deling** – eksporter filer til `public/opptak/` for utvikling og AI-gjennomgang

## Krav

- Moderne mobilnettleser (Chrome/Safari)
- **HTTPS** (eller localhost) for kameratilgang
- Tillatelse til kamera og lyd

## Lokal utvikling

```bash
npm install
npm run dev
```

Åpne URL-en på telefonen via samme nettverk, eller bruk `npm run build && npm run preview`.

## Opptak og avspilling

1. **Start kamera** → trykk **Opptak** under kjøring.
2. Stopp opptak → filen lagres under **Meny → Opptak**.
3. Trykk **Spill av** for å kjøre deteksjon på opptaket (nyttig for skilt/bensin).
4. **Eksporter** filen og legg den i `public/opptak/` + oppdater `manifest.json`
   for å dele med utvikling / AI (se `public/opptak/README.md`).

## Railway

1. Opprett nytt prosjekt fra GitHub-repoet
2. Railway bygger med `Dockerfile` (nginx på port 8080)
3. Gi tjenesten et domene – HTTPS kommer automatisk
4. Åpne siden på mobil, «Legg til på hjemskjerm» via PWA-manifest

## Begrensninger

- Dette er **ikke** en sertifisert førerstøtte. Brukes på eget ansvar.
- Skilt-/prisfunksjon er heuristikk + OCR; treffsikkerhet varierer med lys, vinkel og bevegelse.
- Politi/vegvesen baseres på tekst i bildet, ikke spesialtrent modell.
- Neste steg: finjustert skiltmodell, bedre politibil-gjenkjenning.

## Stack

- Vite + React + TypeScript
- TensorFlow.js + COCO-SSD
- Tesseract.js
- Web Speech API (`nb-NO`)
- nginx + Docker / Railway
