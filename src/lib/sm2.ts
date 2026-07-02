export interface SM2State {
  interval: number;
  repetitions: number;
  easeFactor: number;
}

// quality: 0 = errei, 3 = difícil, 4 = ok, 5 = fácil
export function sm2(quality: 0 | 3 | 4 | 5, state: SM2State): SM2State {
  let { interval, repetitions, easeFactor } = state;

  if (quality >= 3) {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions += 1;
  } else {
    repetitions = 0;
    interval = 1;
  }

  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  return { interval, repetitions, easeFactor };
}

export function nextReviewDate(interval: number): string {
  const d = new Date();
  d.setDate(d.getDate() + interval);
  return d.toISOString().slice(0, 10);
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
