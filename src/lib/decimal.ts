// Calculate with the decimal representation of finite inputs so fractional
// Initiative does not leave a binary floating-point remainder at completion.
function parts(value: number): { coefficient: bigint; scale: number } {
  if (!Number.isFinite(value)) throw new Error("Decimal arithmetic requires finite numbers.");
  const [mantissa, exponent = "0"] = String(value).split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  return { coefficient: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
}

function aligned(left: number, right: number): [bigint, bigint, number] {
  const a = parts(left), b = parts(right), scale = Math.max(a.scale, b.scale);
  return [a.coefficient * BigInt(10) ** BigInt(scale - a.scale), b.coefficient * BigInt(10) ** BigInt(scale - b.scale), scale];
}

function number(coefficient: bigint, scale: number): number {
  return Number(String(coefficient) + "e" + String(-scale));
}

export function decimalAdd(left: number, right: number): number {
  const [a, b, scale] = aligned(left, right);
  return number(a + b, scale);
}

export function decimalSubtract(left: number, right: number): number {
  const [a, b, scale] = aligned(left, right);
  return number(a - b, scale);
}

export function decimalMultiply(left: number, right: number): number {
  const a = parts(left), b = parts(right);
  return number(a.coefficient * b.coefficient, a.scale + b.scale);
}

// Both inputs represent nonnegative progress/cost; a partial round is not an
// inserted cartridge. Decimal division keeps 0.3 / 0.1 at exactly three.
export function completedDecimalUnits(progress: number, cost: number): number {
  if (progress < 0 || cost <= 0) throw new Error("Progress must be nonnegative and unit cost positive.");
  const [a, b] = aligned(progress, cost);
  return Number(a / b);
}
