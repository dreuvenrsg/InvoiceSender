// Pure overhead-allocation math, in integer cents so per-bill allocations
// always sum exactly to the overhead being spread.

/**
 * Split `totalCents` across recipients proportionally to `weights`, using the
 * largest-remainder method so the parts sum exactly to totalCents.
 * Weights of all zero (or empty) return an even split / empty array.
 */
export function allocateCents(totalCents, weights) {
  if (!weights.length) return [];
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const effective = weightSum > 0 ? weights : weights.map(() => 1);
  const effectiveSum = weightSum > 0 ? weightSum : weights.length;

  const exact = effective.map((w) => (totalCents * w) / effectiveSum);
  const floors = exact.map((x) => Math.trunc(x));
  let remainder = totalCents - floors.reduce((a, b) => a + b, 0);

  // Distribute the leftover cents to the largest fractional parts.
  // Negative totals produce negative remainders; step accordingly.
  const step = remainder >= 0 ? 1 : -1;
  const order = exact
    .map((x, i) => ({ i, frac: step * (x - floors[i]) }))
    .sort((a, b) => b.frac - a.frac);
  const out = floors.slice();
  for (let k = 0; remainder !== 0; k = (k + 1) % out.length) {
    out[order[k].i] += step;
    remainder -= step;
  }
  return out;
}

export function toCents(amount) {
  return Math.round((Number(amount) || 0) * 100);
}

export function fromCents(cents) {
  return cents / 100;
}

/** Pick allocation weights for item lines under a given method. */
export function allocationWeights(itemLines, method = "value") {
  switch (method) {
    case "quantity":
      return itemLines.map((l) => Math.abs(l.qty) || 0);
    case "even":
      return itemLines.map(() => 1);
    case "value":
    default:
      return itemLines.map((l) => Math.abs(l.amountCents));
  }
}
