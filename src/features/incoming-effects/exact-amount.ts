/** Decimal arithmetic for a complete planning sequence. Numbers enter once using their
 * authored decimal representation; no intermediate conversion feeds the calculation.
 * This extends the coefficient/scale approach in lib/decimal without changing runtime math. */
export class ExactAmount {
  private constructor(private readonly coefficient: bigint, private readonly scale: number) {}

  static from(value: number): ExactAmount {
    if (!Number.isFinite(value)) throw new Error("Exact amount requires a finite input.");
    const [mantissa, exponent = "0"] = String(value).split("e");
    const [whole, fraction = ""] = mantissa.split(".");
    return new ExactAmount(BigInt(whole + fraction), fraction.length - Number(exponent));
  }

  add(other: ExactAmount): ExactAmount {
    const scale = Math.max(this.scale, other.scale);
    return new ExactAmount(this.coefficient * BigInt(10) ** BigInt(scale - this.scale)
      + other.coefficient * BigInt(10) ** BigInt(scale - other.scale), scale);
  }

  subtract(other: ExactAmount): ExactAmount {
    return this.add(new ExactAmount(-other.coefficient, other.scale));
  }

  multiply(other: ExactAmount): ExactAmount {
    return new ExactAmount(this.coefficient * other.coefficient, this.scale + other.scale);
  }

  percent(): ExactAmount { return new ExactAmount(this.coefficient, this.scale + 2); }
  floorZero(): ExactAmount { return this.coefficient < BigInt(0) ? ExactAmount.from(0) : this; }
  toNumber(): number { return Number(`${this.coefficient}e${-this.scale}`); }

  ceil(): number {
    if (this.scale <= 0) return this.toNumber();
    const divisor = BigInt(10) ** BigInt(this.scale);
    const quotient = this.coefficient / divisor;
    return Number(quotient + (this.coefficient > BigInt(0) && this.coefficient % divisor !== BigInt(0) ? BigInt(1) : BigInt(0)));
  }

  toString(): string {
    const negative = this.coefficient < BigInt(0);
    let digits = String(negative ? -this.coefficient : this.coefficient);
    if (this.scale <= 0) return `${negative ? "-" : ""}${digits}${"0".repeat(-this.scale)}`;
    digits = digits.padStart(this.scale + 1, "0");
    return `${negative ? "-" : ""}${digits.slice(0, -this.scale)}.${digits.slice(-this.scale)}`.replace(/\.?0+$/, "");
  }
}
