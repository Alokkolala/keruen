// Порядок плеч в дне: порожних перегонов должно быть как можно меньше.
// Сети не требует.

function breaksIn(seq) {
  let n = 0
  for (let i = 1; i < seq.length; i++) if (seq[i - 1].to_id !== seq[i].from_id) n++
  return n
}

function chainByRoute(list, baseId) {
  const byTime = [...list].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  if (byTime.length < 2) return byTime

  if (byTime.length <= 7) {
    let best = byTime
    let bestScore = Infinity
    const walk = (rest, acc) => {
      if (!rest.length) {
        const score = breaksIn(acc) * 10 + (baseId && acc[0].from_id === baseId ? 0 : 1)
        if (score < bestScore) {
          bestScore = score
          best = acc
        }
        return
      }
      for (let i = 0; i < rest.length; i++) {
        walk([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]])
      }
    }
    walk(byTime, [])
    return best
  }

  const left = [...byTime]
  const out = []
  let at = baseId
  while (left.length) {
    let i = at ? left.findIndex((o) => o.from_id === at) : -1
    if (i < 0) i = 0
    const [next] = left.splice(i, 1)
    out.push(next)
    at = next.to_id
  }
  return out
}

const leg = (from_id, to_id, min) => ({
  from_id,
  to_id,
  created_at: new Date(2026, 7, 21, 9, min).toISOString(),
})
const show = (seq) => seq.map((o) => `${o.from_id}→${o.to_id}`).join(', ')

const CASES = [
  {
    name: 'то, что было на экране: жадность от базы давала 150 порожних км',
    base: 'aktau',
    legs: [leg('aktau', 'shetpe', 0), leg('zhanaozen', 'aktau', 5)],
    wantBreaks: 0,
    wantFirst: 'zhanaozen',
  },
  {
    name: 'цепочка из трёх собирается целиком',
    base: 'aktau',
    legs: [leg('shetpe', 'beineu', 10), leg('aktau', 'shetpe', 0), leg('beineu', 'aktau', 20)],
    wantBreaks: 0,
    wantFirst: 'aktau',
  },
  {
    name: 'при равных разрывах начинаем от базы',
    base: 'aktau',
    legs: [leg('aktau', 'shetpe', 0), leg('kuryk', 'beineu', 5)],
    wantBreaks: 1,
    wantFirst: 'aktau',
  },
  {
    name: 'одно плечо — ничего не ломаем',
    base: 'aktau',
    legs: [leg('aktau', 'shetpe', 0)],
    wantBreaks: 0,
    wantFirst: 'aktau',
  },
]

let bad = 0
for (const c of CASES) {
  const got = chainByRoute(c.legs, c.base)
  const b = breaksIn(got)
  const okBreaks = b === c.wantBreaks
  const okFirst = got[0].from_id === c.wantFirst
  if (!okBreaks || !okFirst) {
    bad++
    console.log(`ПЛОХО  ${c.name}`)
    console.log(`         вышло: ${show(got)} (разрывов ${b}, ждали ${c.wantBreaks} и старт ${c.wantFirst})`)
  } else {
    console.log(`ok     ${c.name}`)
    console.log(`         ${show(got)} — разрывов ${b}`)
  }
}

console.log(bad === 0 ? '\nПорядок плеч верный.' : `\nПровалов: ${bad}`)
process.exit(bad === 0 ? 0 : 1)
