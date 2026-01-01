export function roundToStep(value: number, step: 0.01 | 0.05 | 0.1) {
  if (!Number.isFinite(value)) return value;
  const inv = 1 / step;
  return Math.round(value * inv) / inv;
}

// “Psych” pricing: end in .99 for 0.01 step, end in .95 for 0.05 step, end in .9 for 0.1 step
export function applyPsychPrice(value: number, step: 0.01 | 0.05 | 0.1) {
  if (!Number.isFinite(value)) return value;
  if (value <= 0) return value;

  const floor = Math.floor(value);
  if (step === 0.01) return floor + 0.99;
  if (step === 0.05) return floor + 0.95;
  return floor + 0.9;
}
