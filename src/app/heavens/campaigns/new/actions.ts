"use server";

import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import {
  campaign,
  campaignAllowedSystem,
  campaignCurrencySystem,
  campaignDerivedCurrency,
  campaignFatePointMethod,
  campaignSystem,
} from "@/db/campaign-schema";
import { item, itemTagCatalog, itemTagLink } from "@/db/item-schema";
import { race } from "@/db/race-schema";
import {
  campaignAllowedRace,
  campaignInventoryItem,
  campaignInventoryTag,
} from "@/db/realm-schema";
import { auth } from "@/lib/auth";

function readText(formData: FormData, name: string) {
  const value = formData.get(name);

  if (typeof value !== "string") {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function readNonNegativeNumber(
  formData: FormData,
  name: string,
  label: string,
) {
  const text = readText(formData, name);
  const value = Number(text);

  if (!text || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }

  return value;
}

function readPositiveIntegerList(formData: FormData, name: string) {
  return [
    ...new Set(
      formData.getAll(name).map((rawValue) => {
        const value = typeof rawValue === "string" ? Number(rawValue) : Number.NaN;

        if (!Number.isInteger(value) || value <= 0) {
          throw new Error(`${name} contains an invalid record.`);
        }

        return value;
      }),
    ),
  ];
}

export async function createCampaign(formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("You must be signed in.");
  }

  /*
   * Important:
   * Campaign creation is protected server-side.
   * Never trust the browser to tell us who owns a campaign.
   */
  const godAccess = await db
    .select({
      role: userRole.role,
    })
    .from(userRole)
    .where(
      and(
        eq(userRole.userId, session.user.id),
        eq(userRole.role, "god"),
      ),
    )
    .limit(1);

  if (godAccess.length === 0) {
    throw new Error("G.O.D. access is required.");
  }

  const name = readText(formData, "name");

  if (!name) {
    throw new Error("Campaign Name is required.");
  }

  const attributePoints = readNonNegativeNumber(
    formData,
    "attributePoints",
    "Attribute Points",
  );

  const skillPoints = readNonNegativeNumber(
    formData,
    "skillPoints",
    "Skill Points",
  );

  const maxStartingSkill = readNonNegativeNumber(
    formData,
    "maxStartingSkill",
    "Max Starting Points Spent per Skill",
  );

  const pointsToUnlockNextTier = readNonNegativeNumber(
    formData,
    "pointsToUnlockNextTier",
    "Points Needed to Unlock Next Tier",
  );

  const maxPointsInSkill = readNonNegativeNumber(
    formData,
    "maxPointsInSkill",
    "Max Points in a Standard Skill",
  );

  const startingCreditAmount = readNonNegativeNumber(
    formData,
    "startingCreditAmount",
    "Starting Credit Amount",
  );

  const currencySystemValue = readText(
    formData,
    "currencySystem",
  );

  if (
    !campaignCurrencySystem.enumValues.includes(
      currencySystemValue as
        (typeof campaignCurrencySystem.enumValues)[number],
    )
  ) {
    throw new Error("Invalid Currency System.");
  }

  const currencySystem =
    currencySystemValue as
      (typeof campaignCurrencySystem.enumValues)[number];

  const fatePointMethodValue = readText(
    formData,
    "fatePointMethod",
  );

  if (
    !campaignFatePointMethod.enumValues.includes(
      fatePointMethodValue as
        (typeof campaignFatePointMethod.enumValues)[number],
    )
  ) {
    throw new Error("Invalid Fate Point Method.");
  }

  const fatePointMethod =
    fatePointMethodValue as
      (typeof campaignFatePointMethod.enumValues)[number];

  let assignedFatePoints: number | null = null;

  if (fatePointMethod === "Assigned") {
    const text = readText(
      formData,
      "assignedFatePoints",
    );

    const value = Number(text);

    if (
      !text ||
      !Number.isInteger(value) ||
      value < 0
    ) {
      throw new Error(
        "Assigned Fate Points must be a whole number zero or greater.",
      );
    }

    assignedFatePoints = value;
  }

  /*
   * Allowed Systems
   */
  const requestedSystems = formData
    .getAll("allowedSystems")
    .filter(
      (value): value is string =>
        typeof value === "string",
    );

  const allowedSystems = [
    ...new Set(requestedSystems),
  ].map((system) => {
    if (
      !campaignSystem.enumValues.includes(
        system as
          (typeof campaignSystem.enumValues)[number],
      )
    ) {
      throw new Error(
        `Unsupported campaign system: ${system}`,
      );
    }

    return system as
      (typeof campaignSystem.enumValues)[number];
  });

  const allowedRaceIds = readPositiveIntegerList(formData, "allowedRaceIds");
  const inventoryTagIds = readPositiveIntegerList(formData, "inventoryTagIds");
  const explicitInventoryItemIds = readPositiveIntegerList(
    formData,
    "inventoryItemIds",
  );

  const [validRaces, validTags, validItems, taggedItems] = await Promise.all([
    allowedRaceIds.length
      ? db.select({ id: race.id }).from(race).where(inArray(race.id, allowedRaceIds))
      : [],
    inventoryTagIds.length
      ? db
          .select({ id: itemTagCatalog.id })
          .from(itemTagCatalog)
          .where(inArray(itemTagCatalog.id, inventoryTagIds))
      : [],
    explicitInventoryItemIds.length
      ? db
          .select({ id: item.id })
          .from(item)
          .where(inArray(item.id, explicitInventoryItemIds))
      : [],
    inventoryTagIds.length
      ? db
          .select({ itemId: itemTagLink.itemId })
          .from(itemTagLink)
          .where(inArray(itemTagLink.tagId, inventoryTagIds))
      : [],
  ]);

  if (validRaces.length !== allowedRaceIds.length) {
    throw new Error("An Allowed Race is no longer available.");
  }

  if (validTags.length !== inventoryTagIds.length) {
    throw new Error("An Inventory Tag is no longer available.");
  }

  if (validItems.length !== explicitInventoryItemIds.length) {
    throw new Error("An Equipment or Inventory record is no longer available.");
  }

  const authorizedItemIds = [
    ...new Set([
      ...explicitInventoryItemIds,
      ...taggedItems.map(({ itemId }) => itemId),
    ]),
  ];

  /*
   * Derived Currencies
   */
  const currencyNames = formData
    .getAll("derivedCurrencyName")
    .map((value) =>
      typeof value === "string"
        ? value.trim()
        : "",
    );

  const currencyDescriptions = formData
    .getAll("derivedCurrencyDescription")
    .map((value) =>
      typeof value === "string"
        ? value.trim()
        : "",
    );

  const currencyValues = formData
    .getAll("derivedCurrencyCreditsPerUnit")
    .map((value) =>
      typeof value === "string"
        ? value.trim()
        : "",
    );

  const derivedCurrencies: {
    name: string;
    description: string;
    creditsPerUnit: number;
  }[] = [];

  if (currencySystem === "Derived Currency") {
    if (currencyNames.length === 0) {
      throw new Error(
        "Derived Currency requires at least one currency.",
      );
    }

    if (
      currencyNames.length !==
        currencyDescriptions.length ||
      currencyNames.length !== currencyValues.length
    ) {
      throw new Error(
        "Derived Currency data is incomplete.",
      );
    }

    const namesSeen = new Set<string>();

    for (
      let index = 0;
      index < currencyNames.length;
      index += 1
    ) {
      const currencyName = currencyNames[index];
      const description =
        currencyDescriptions[index];

      const creditsPerUnit = Number(
        currencyValues[index],
      );

      if (!currencyName) {
        throw new Error(
          `Currency ${index + 1} Name is required.`,
        );
      }

      if (!description) {
        throw new Error(
          `Currency ${index + 1} Description is required.`,
        );
      }

      if (
        !Number.isFinite(creditsPerUnit) ||
        creditsPerUnit <= 0
      ) {
        throw new Error(
          `Currency ${index + 1} Credit Value must be greater than zero.`,
        );
      }

      const comparisonName =
        currencyName.toLocaleLowerCase();

      if (namesSeen.has(comparisonName)) {
        throw new Error(
          `Currency ${currencyName} cannot be added twice.`,
        );
      }

      namesSeen.add(comparisonName);

      derivedCurrencies.push({
        name: currencyName,
        description,
        creditsPerUnit,
      });
    }
  }

  const createdCampaignId = await db.transaction(async (tx) => {
    const [createdCampaign] = await tx
      .insert(campaign)
      .values({
        name,

        attributePoints,
        skillPoints,
        maxStartingSkill,
        pointsToUnlockNextTier,
        maxPointsInSkill,
        startingCreditAmount,

        currencySystem,
        fatePointMethod,
        assignedFatePoints,

        /*
         * OWNERSHIP:
         * The authenticated creator becomes the campaign owner.
         */
        createdByUserId: session.user.id,
      })
      .returning({
        id: campaign.id,
      });

    if (!createdCampaign) {
      throw new Error(
        "Campaign could not be created.",
      );
    }

    if (allowedSystems.length > 0) {
      await tx
        .insert(campaignAllowedSystem)
        .values(
          allowedSystems.map(
            (system, index) => ({
              campaignId: createdCampaign.id,
              system,
              sortOrder: index,
            }),
          ),
        );
    }

    if (derivedCurrencies.length > 0) {
      await tx
        .insert(campaignDerivedCurrency)
        .values(
          derivedCurrencies.map(
            (currency, index) => ({
              campaignId: createdCampaign.id,
              name: currency.name,
              description:
                currency.description,
              creditsPerUnit:
                currency.creditsPerUnit,
              sortOrder: index,
            }),
          ),
        );
    }

    if (allowedRaceIds.length > 0) {
      await tx.insert(campaignAllowedRace).values(
        allowedRaceIds.map((raceId, sortOrder) => ({
          campaignId: createdCampaign.id,
          raceId,
          sortOrder,
        })),
      );
    }

    if (inventoryTagIds.length > 0) {
      await tx.insert(campaignInventoryTag).values(
        inventoryTagIds.map((tagId, sortOrder) => ({
          campaignId: createdCampaign.id,
          tagId,
          sortOrder,
        })),
      );
    }

    if (authorizedItemIds.length > 0) {
      await tx.insert(campaignInventoryItem).values(
        authorizedItemIds.map((itemId, sortOrder) => ({
          campaignId: createdCampaign.id,
          itemId,
          sortOrder,
        })),
      );
    }

    return createdCampaign.id;
  });

  revalidatePath("/heavens");
  revalidatePath("/heavens/campaigns");
  revalidatePath("/realms");

  redirect(`/heavens/campaigns?campaign=${createdCampaignId}`);
}
