// daily activity log, streaks, weekly digest. all local

export const dayKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const MON = (d) => {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
};

export function logActivity(activity, type, amount = 1) {
  const k = dayKey();
  const day = { ...(activity[k] || {}) };
  day[type] = (day[type] || 0) + amount;
  return { ...activity, [k]: day };
}

export function activeDays(activity) {
  return new Set(
    Object.entries(activity || {})
      .filter(([, v]) => Object.values(v).some((n) => n > 0))
      .map(([k]) => k)
  );
}

export function streakInfo(activity) {
  const set = activeDays(activity);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(today);
  if (!set.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (set.has(dayKey(cursor))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const k of sorted) {
    const d = new Date(k + "T12:00:00");
    if (prev) {
      const diff = Math.round((d - prev) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = d;
  }
  const weekStart = MON(today);
  const weekDots = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    weekDots.push(set.has(dayKey(d)));
  }
  return { current, longest, weekDots };
}

export function weeklyDigest(activity, quizScores) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = MON(today).getTime();
  let notes = 0;
  let cards = 0;
  let pomos = 0;
  for (const [k, v] of Object.entries(activity || {})) {
    const t = new Date(k + "T12:00:00").getTime();
    if (t >= start) {
      notes += v.notes || 0;
      cards += v.cards || 0;
      pomos += v.pomo || 0;
    }
  }
  const attempts = (quizScores || []).filter((q) => new Date(q.ts).getTime() >= start);
  const avg = attempts.length
    ? Math.round(attempts.reduce((a, q) => a + (q.total ? q.score / q.total : 0), 0) / attempts.length * 100)
    : null;
  return { notes, cards, pomos, quizzes: attempts.length, avg };
}
