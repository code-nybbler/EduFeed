// A "learning day" is a calendar day (in the user's own time zone) on which they
// read DAILY_GOAL cards. The streak is the number of learning days in a row.
// Pure functions: streak in, new streak out.

export const DAILY_GOAL = 5;

export const emptyStreak = () => ({
  current: 0, // days in a row, as of `lastDay`
  best: 0,
  lastDay: null, // last day the goal was reached, 'YYYY-MM-DD'
  todayDay: null, // the day `todayCount` belongs to
  todayCount: 0, // cards read on `todayDay`
});

const pad = (n) => String(n).padStart(2, '0');

export const dayKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function shiftDay(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + delta)); // the Date constructor handles month and DST rollover
}

/** Call once each time the user reads a card. */
export function recordView(streak, now = new Date()) {
  const today = dayKey(now);
  const next =
    streak.todayDay === today ? { ...streak } : { ...streak, todayDay: today, todayCount: 0 };
  next.todayCount += 1;

  if (next.todayCount >= DAILY_GOAL && next.lastDay !== today) {
    next.current = next.lastDay === shiftDay(today, -1) ? next.current + 1 : 1;
    next.lastDay = today;
    next.best = Math.max(next.best, next.current);
  }
  return next;
}

/** What to show: a streak whose last day is older than yesterday has already ended. */
export function streakStatus(streak, now = new Date()) {
  const today = dayKey(now);
  const doneToday = streak.lastDay === today;
  const alive = doneToday || streak.lastDay === shiftDay(today, -1);
  const todayCount = streak.todayDay === today ? streak.todayCount : 0;
  return {
    count: alive ? streak.current : 0,
    best: streak.best,
    doneToday,
    todayCount: Math.min(todayCount, DAILY_GOAL),
    goal: DAILY_GOAL,
    // Has a streak that today's reading would extend, or lose if skipped.
    atRisk: alive && !doneToday && streak.current > 0,
  };
}
