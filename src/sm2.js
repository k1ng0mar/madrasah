// sm2 spaced repetition, this is how cards get scheduled
// again means back in 10 minutes, good pushes it out, easy pushes further

export function applySM2(card, quality, now = new Date()) {
  let ef = card.ease ?? 2.5;
  let interval = card.interval ?? 0;
  let reps = card.reps ?? 0;
  let lapses = card.lapses ?? 0;

  if (quality < 3) {
    reps = 0;
    interval = 0;
    lapses += 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ef);
    reps += 1;
  }

  ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ef < 1.3) ef = 1.3;

  const due = new Date(now);
  if (quality < 3) due.setMinutes(due.getMinutes() + 10);
  else due.setDate(due.getDate() + interval);

  return {
    ease: Number(ef.toFixed(3)),
    interval,
    reps,
    lapses,
    dueAt: due.toISOString(),
    lastReviewedAt: now.toISOString(),
    totalReviews: (card.totalReviews || 0) + 1,
  };
}

export function dueCards(cards, now = new Date()) {
  const t = now.toISOString();
  return (cards || []).filter((c) => !c.dueAt || c.dueAt <= t);
}

export const QUALITY = [
  { q: 0, label: "Again" },
  { q: 3, label: "Hard" },
  { q: 4, label: "Good" },
  { q: 5, label: "Easy" },
];
