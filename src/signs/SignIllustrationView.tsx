import type { SignIllustration } from './illustration'

/** Norske skilt-illustrasjoner med tall/tekst. */
export function SignIllustrationView({
  illustration,
}: {
  illustration: SignIllustration
}) {
  if (illustration.type === 'speed' || illustration.type === 'generic-sign') {
    const value =
      illustration.type === 'speed' ? String(illustration.value) : '?'
    return (
      <svg
        className="sign-illu sign-illu--speed"
        viewBox="0 0 120 120"
        role="img"
        aria-label={
          illustration.type === 'speed'
            ? `Fartsgrense ${illustration.value}`
            : 'Trafikkskilt'
        }
      >
        <circle cx="60" cy="60" r="56" fill="#e10600" />
        <circle cx="60" cy="60" r="44" fill="#ffffff" />
        <text
          x="60"
          y="60"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Arial Black, Arial, sans-serif"
          fontWeight="900"
          fontSize={value.length > 2 ? 38 : 48}
          fill="#111"
        >
          {value}
        </text>
      </svg>
    )
  }

  if (illustration.type === 'info' || illustration.type === 'generic-info') {
    const lines = wrapText(
      illustration.type === 'info' ? illustration.text : 'INFO',
      14,
    ).slice(0, 4)
    return (
      <svg
        className="sign-illu sign-illu--info"
        viewBox="0 0 160 110"
        role="img"
        aria-label="Informasjonsskilt"
      >
        <rect x="2" y="2" width="156" height="106" rx="8" fill="#0055a5" />
        <rect x="10" y="10" width="140" height="90" rx="4" fill="#0a6ecc" />
        {lines.map((line, i) => (
          <text
            key={i}
            x="80"
            y={38 + i * 18}
            textAnchor="middle"
            fontFamily="Arial, Helvetica, sans-serif"
            fontWeight="700"
            fontSize="14"
            fill="#ffffff"
          >
            {line}
          </text>
        ))}
      </svg>
    )
  }

  // fuel
  const fuel =
    illustration.type === 'fuel' ? illustration.fuel : 'Bensin'
  const price =
    illustration.type === 'fuel' ? illustration.price : '--.--'
  return (
    <svg
      className="sign-illu sign-illu--fuel"
      viewBox="0 0 170 100"
      role="img"
      aria-label={`${fuel} ${price} kr/l`}
    >
      <rect x="1" y="1" width="168" height="98" rx="8" fill="#1a1f24" />
      <rect x="8" y="8" width="154" height="84" rx="5" fill="#0d1116" />
      <text
        x="16"
        y="32"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="13"
        fill="#8b9bb0"
      >
        {fuel.toUpperCase()}
      </text>
      <text
        x="16"
        y="72"
        fontFamily="Consolas, Menlo, monospace"
        fontWeight="800"
        fontSize="36"
        fill="#f5c542"
      >
        {price}
      </text>
      <text
        x="150"
        y="72"
        textAnchor="end"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="14"
        fill="#8b9bb0"
      >
        kr/l
      </text>
    </svg>
  )
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['INFO']
}
