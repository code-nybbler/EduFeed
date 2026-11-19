import { streakStatus } from '../streak.js';

export default function StreakBadge({ streak }) {
  const s = streakStatus(streak);
  const left = s.goal - s.todayCount;
  const cards = `${left} more ${left === 1 ? 'card' : 'cards'}`;

  const label = s.doneToday
    ? `${s.count}-day streak. Today's goal is done.`
    : s.count > 0
      ? `${s.count}-day streak. Read ${cards} today to keep it going.`
      : `Read ${s.goal} cards in a day to start a streak.`;

  return (
    <span
      className={`streak${s.doneToday ? ' done' : ''}${s.atRisk ? ' risk' : ''}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">🔥</span>
      <strong aria-hidden="true">{s.count}</strong>
      <span className="streak-progress" aria-hidden="true">
        {s.doneToday ? '✓' : `${s.todayCount}/${s.goal}`}
      </span>
    </span>
  );
}
