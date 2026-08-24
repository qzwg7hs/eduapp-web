interface Point {
  exam_date: string
  score: number
  total: number
}

interface Props {
  data: Point[]
  emptyLabel: string
  color?: string
}

const WIDTH = 600
const HEIGHT = 200
const PAD_L = 28
const PAD_R = 12
const PAD_T = 12
const PAD_B = 24
const Y_MIN = 0
const Y_MAX = 30

function fmtDate(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

// Lightweight hand-rolled SVG line chart — fixed y-axis 0-30 (daily exam is
// always out of 30 questions), one point per day the student actually
// submitted an exam (no fabricated zero days for days they didn't take it).
export default function ScoreTrendChart({ data, emptyLabel, color = '#e8622c' }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted">
        {emptyLabel}
      </div>
    )
  }

  const innerW = WIDTH - PAD_L - PAD_R
  const innerH = HEIGHT - PAD_T - PAD_B

  function x(i: number) {
    return data.length === 1 ? PAD_L + innerW / 2 : PAD_L + (i / (data.length - 1)) * innerW
  }
  function y(score: number) {
    const clamped = Math.max(Y_MIN, Math.min(Y_MAX, score))
    return PAD_T + innerH - ((clamped - Y_MIN) / (Y_MAX - Y_MIN)) * innerH
  }

  const points = data.map((d, i) => ({ ...d, cx: x(i), cy: y(d.score) }))
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx} ${p.cy}`).join(' ')
  const gridLines = [0, 10, 20, 30]

  // Show every date label when there are few points; thin them out as the
  // history grows so labels don't overlap.
  const labelEvery = Math.max(1, Math.ceil(data.length / 8))

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {gridLines.map(g => (
        <g key={g}>
          <line x1={PAD_L} x2={WIDTH - PAD_R} y1={y(g)} y2={y(g)} stroke="#f0e5d4" strokeWidth={1} />
          <text x={PAD_L - 6} y={y(g)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#aaa090">
            {g}
          </text>
        </g>
      ))}

      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

      {points.map((p, i) => (
        <g key={p.exam_date}>
          <circle cx={p.cx} cy={p.cy} r={3.5} fill={color} stroke="#fff" strokeWidth={1.5} />
          <title>{`${p.exam_date}: ${p.score}/${p.total}`}</title>
          {i % labelEvery === 0 && (
            <text x={p.cx} y={HEIGHT - 6} textAnchor="middle" fontSize={9} fill="#aaa090">
              {fmtDate(p.exam_date)}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
