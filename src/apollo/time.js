/* Scale and clock helpers shared by the Load forecast page and its charts. */

export const nice = (x) => {
  if (!(x > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(x))
  const m = x / p
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p
}

/** Local wall-clock parts of a UTC instant in `tz`. */
const partsFmt = new Map()
export function local(t, tz) {
  if (!partsFmt.has(tz)) {
    partsFmt.set(tz, new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }))
  }
  const p = Object.fromEntries(partsFmt.get(tz).formatToParts(new Date(t)).map((x) => [x.type, x.value]))
  return { day: p.weekday, hm: `${p.hour}:${p.minute}`, h: Number(p.hour), m: Number(p.minute) }
}

