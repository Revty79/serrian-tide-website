import type { CharacterCampaignRules } from "./models";

type CurrencyDefinition = CharacterCampaignRules["derivedCurrencies"][number];

export type CampaignMoneyEntry = CurrencyDefinition & {
  quantity: number;
};

export type CampaignMoneyBreakdown = {
  entries: CampaignMoneyEntry[];
  fullyRepresented: boolean;
  formatted: string;
};

export type CampaignCurrencyHolding = {
  currencyId: number;
  quantity: number;
};

const MAX_DECIMAL_PLACES = 6;

function decimalPlaces(value: number): number {
  const text = value.toString().toLowerCase();
  if (text.includes("e-")) {
    const [coefficient, exponentText] = text.split("e-");
    const exponent = Number(exponentText);
    const coefficientDecimals = coefficient?.split(".")[1]?.length ?? 0;
    return Math.min(MAX_DECIMAL_PLACES, exponent + coefficientDecimals);
  }
  return Math.min(MAX_DECIMAL_PLACES, text.split(".")[1]?.length ?? 0);
}

function numberLabel(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(MAX_DECIMAL_PLACES).replace(/0+$/, "").replace(/\.$/, "");
}

function formatEntries(entries: readonly CampaignMoneyEntry[]): string {
  const used = entries.filter((entry) => entry.quantity > 0);
  if (used.length > 0) {
    return used
      .map((entry) => `${numberLabel(entry.quantity)} ${entry.name}`)
      .join(", ");
  }
  const smallest = entries[entries.length - 1];
  return smallest ? `0 ${smallest.name}` : "Currency not configured";
}

export function convertCreditsToDerivedUnits(
  credits: number,
  creditsPerUnit: number,
): number | null {
  if (!Number.isFinite(credits) || credits < 0) return null;
  if (!Number.isFinite(creditsPerUnit) || creditsPerUnit <= 0) return null;
  return credits / creditsPerUnit;
}

export function getCampaignMoneyBreakdown(
  canonicalCredits: number,
  currencySystem: CharacterCampaignRules["currencySystem"],
  currencies: readonly CurrencyDefinition[],
): CampaignMoneyBreakdown {
  if (!Number.isFinite(canonicalCredits) || canonicalCredits < 0) {
    return { entries: [], fullyRepresented: false, formatted: "Invalid amount" };
  }
  if (currencySystem === "Credits") {
    const entries = [
      {
        id: 0,
        campaignId: 0,
        name: "Credits",
        description: "Campaign Credits",
        creditsPerUnit: 1,
        sortOrder: 0,
        quantity: canonicalCredits,
      },
    ];
    return { entries, fullyRepresented: true, formatted: formatEntries(entries) };
  }

  const validCurrencies = currencies
    .filter(
      (currency) =>
        Number.isFinite(currency.creditsPerUnit) && currency.creditsPerUnit > 0,
    )
    .sort(
      (left, right) =>
        right.creditsPerUnit - left.creditsPerUnit ||
        left.sortOrder - right.sortOrder ||
        left.id - right.id,
    );
  if (validCurrencies.length === 0) {
    return {
      entries: [],
      fullyRepresented: false,
      formatted: "Currency not configured",
    };
  }

  const precision = Math.max(
    decimalPlaces(canonicalCredits),
    ...validCurrencies.map((currency) => decimalPlaces(currency.creditsPerUnit)),
  );
  const scale = 10 ** precision;
  let remaining = Math.round(canonicalCredits * scale);
  const entries = validCurrencies.map((currency) => {
    const unitValue = Math.round(currency.creditsPerUnit * scale);
    const quantity = unitValue > 0 ? Math.floor(remaining / unitValue) : 0;
    remaining -= quantity * unitValue;
    return { ...currency, quantity };
  });
  const fullyRepresented = remaining === 0;
  return {
    entries,
    fullyRepresented,
    formatted: fullyRepresented
      ? formatEntries(entries)
      : `${formatEntries(entries)} · denomination gap`,
  };
}

export function getCanonicalCreditsFromHoldings(
  currencies: readonly CurrencyDefinition[],
  holdings: readonly CampaignCurrencyHolding[],
): number {
  const values = new Map(
    currencies.map((currency) => [currency.id, currency.creditsPerUnit]),
  );
  const total = holdings.reduce((sum, holding) => {
    const unitValue = values.get(holding.currencyId);
    return unitValue === undefined
      ? sum
      : sum + holding.quantity * unitValue;
  }, 0);
  return Math.round(total * 1_000_000) / 1_000_000;
}

export function getStoredCampaignMoneyBreakdown(
  canonicalCredits: number,
  currencySystem: CharacterCampaignRules["currencySystem"],
  currencies: readonly CurrencyDefinition[],
  holdings: readonly CampaignCurrencyHolding[],
): CampaignMoneyBreakdown {
  if (currencySystem === "Credits") {
    return getCampaignMoneyBreakdown(canonicalCredits, currencySystem, currencies);
  }
  if (holdings.length === 0 && canonicalCredits > 0) {
    return getCampaignMoneyBreakdown(canonicalCredits, currencySystem, currencies);
  }

  const quantities = new Map<number, number>();
  let valid = true;
  for (const holding of holdings) {
    if (
      !Number.isInteger(holding.quantity) ||
      holding.quantity < 0 ||
      quantities.has(holding.currencyId)
    ) {
      valid = false;
      continue;
    }
    quantities.set(holding.currencyId, holding.quantity);
  }
  const validCurrencies = currencies
    .filter(
      (currency) =>
        Number.isFinite(currency.creditsPerUnit) && currency.creditsPerUnit > 0,
    )
    .sort(
      (left, right) =>
        right.creditsPerUnit - left.creditsPerUnit ||
        left.sortOrder - right.sortOrder ||
        left.id - right.id,
    );
  const currencyIds = new Set(validCurrencies.map((currency) => currency.id));
  if ([...quantities.keys()].some((currencyId) => !currencyIds.has(currencyId))) {
    valid = false;
  }
  const entries = validCurrencies.map((currency) => ({
    ...currency,
    quantity: quantities.get(currency.id) ?? 0,
  }));
  const heldCreditValue = getCanonicalCreditsFromHoldings(
    validCurrencies,
    holdings,
  );
  const matchesCanonicalBalance =
    Math.abs(heldCreditValue - canonicalCredits) <= 0.000001;
  return {
    entries,
    fullyRepresented: valid && entries.length > 0 && matchesCanonicalBalance,
    formatted:
      valid && entries.length > 0
        ? formatEntries(entries)
        : "Currency holdings need attention",
  };
}

export function formatCampaignMoney(
  canonicalCredits: number,
  currencySystem: CharacterCampaignRules["currencySystem"],
  currencies: readonly CurrencyDefinition[],
): string {
  return getCampaignMoneyBreakdown(
    canonicalCredits,
    currencySystem,
    currencies,
  ).formatted;
}
