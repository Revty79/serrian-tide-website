import { FIELD_HELP } from "./field-help";

export type PageHelp = { title: string; introduction: string; steps: string[]; topics: Record<string, string>; fields?: string[] };
const authoring = ["Select an existing record or create a new draft.", "Work through its tabs. Use the ? beside a field for its meaning and an example where useful.", "Review the result and save. Opening help never saves, spends resources or changes your draft."];
const lifecycle = {
  "Save, Archive and Delete": "Save keeps your changes. Archive puts an entry away so it is no longer offered as a new choice, but existing uses can still refer to it. Delete removes it permanently and may be blocked if something still uses it.",
  "Blank versus zero": "Blank usually means you have not entered a value yet. Zero means you have chosen zero. Check the field's help before using zero for a cost you do not know.",
  "Descriptions versus mechanics": "Descriptions and notes explain things to people. The game uses the separate rule fields to do its calculations. Writing an effect in a description does not make it happen automatically.",
};

const guides: Record<string, PageHelp> = {
  race: { title: "Race authoring", introduction: "Define the racial information a Character uses without replacing the Character's own choices.", steps: authoring, fields: ["race", "interaction"], topics: { ...lifecycle,
    "HP & Hit Locations": "Keep Standard humanoid or choose Custom Race anatomy. Name shared HP pools, allocate percentages of character Total HP, and map results 0 through 9 to those pools. Repeated results share damage. Race changes apply to assigned Characters; removed pools keep their recorded damage and injuries. Review numbered protection and armor coverage when changing the table. Variant anatomy is an independent copy.",
    "Mechanics": "Attribute Caps are creation limits. Base Magic multiplies Mana. Movement supplies the base for each authored mode. Natural Protection uses one Soak value and its coverage.",
    "Natural Attacks": "Author inherent attacks such as Bite, Claws or breath. Set Damage, positive Initiative, mode and range/reach, the attack's own magical nature, and optional on-hit effects or Magic Construction. Select its intended Skill without granting it, and identify required HP pools and hit locations with notes for specific body features. Save, reorder or remove attacks in this tab. Variant clones receive independent copies. These definitions are saved for later Character integration; they do not add attack buttons or transformation rules.",
    "Forms": "The Race itself is the normal state. Each Form describes another body or state of this Race. Keep the normal choices in each section or describe different ones; a different list with no entries means none. Skill additions keep learned Skills and normal Race grants. Attribute entries add to or subtract from the Character's normal scores; zero changes nothing. Access describes who qualifies, using saved normal scores and abilities. Each way to qualify requires all its requirements, and any complete way is enough. Transformation records how changing and returning should work, including costs and equipment. Save Race after editing. Clone as Variant makes independent copies. View Form shows the result without changing the Character, spending resources or affecting saves and printing.",
    "Skills & Abilities": "Search for an eligible existing Skill, choose the exact record and add its Race link. This does not create another Skill. Save the Race after changing links.",
    "Variants": "Save the Race, open Variants, enter a new name and choose Clone as Variant. This makes a separate copy. Changing either Race afterward does not change the other. Save or discard any unfinished edits before cloning.",
    "Multiple protections": "Keep separate named entries when needed. If more than one covers the hit location, the game asks for a G.O.D. ruling; no automatic stacking rule is assumed.",
  } },
  creature: { title: "Creature authoring", introduction: "Build the master definition used to construct Creature NPCs and encounter snapshots.", steps: authoring, fields: ["creature", "interaction"], topics: { ...lifecycle,
    "Attributes, Size and calculated values": "Creature Size uses Creature calculations. Enter the saved values and review the resulting summary, HP and Challenge Rating. These rules are different from Race Size.",
    "Attacks": "Start with Name, Attack %, positive Attack Initiative, Damage and Damage Type. Select Attack Mode to see the relevant reach or range fields. Advanced settings preserve more specialised rules.",
    "Abilities and Use Conditions": "Choose Activation Type and author what the Ability does. Use Conditions say when it is available. Supported facts are checked at use; unknown facts need a G.O.D. ruling. Triggered does not mean an unreviewed automatic action.",
    "Individual copies": "A constructed NPC or encounter Creature has its own saved snapshot. Editing the master does not silently rewrite an existing individual.",
    "Harvest & Utility": "Keep materials and practical uses here. This is separate from Attack, Ability and defense execution.",
  } },
  item: { title: "Equipment and Inventory authoring", introduction: "Create catalog definitions here. A Character's owned copies, quantity, condition and equipment state are managed separately.", steps: authoring, fields: ["item"], topics: { ...lifecycle,
    "Equipment versus Inventory": "Equipment records can take part in equipment and combat workflows when their profiles and owned states are ready. Inventory-only records do not automatically become combat weapons or worn armor.",
    "Weapon readiness": "Complete the weapon profile, approved Skill paths and applicable preparation costs. For ranged weapons, link ammunition and configure range, loading and firing modes. Prepare the owned copy in Firearm setup or combat Weapons.",
    "Armor": "Author Base Soak and actual covered locations. On the Character, the owned armor must be Worn to contribute protection.",
    "Abilities": "Choose when the ability happens, its cost and supported effects selected in the form. Passive powers depend on equipment state; activated powers are deliberately used. Keep unsupported exceptions as manual instructions.",
    "Tags, properties and variants": "Tags and saved properties can supply facts for rule matching. Variants are independent copies of saved definitions; a variant's source is a reminder of where it came from; later changes do not carry over.",
  } },
  skill: { title: "Skill authoring", introduction: "Skills have stable identities. Names, classifications and tiers describe a Skill; exact parent links establish its path.", steps: authoring, fields: ["skill"], topics: { ...lifecycle,
    "Pathing": "Find the exact parent record, add the relationship and review the resulting path. Similar names or matching tier numbers do not create a parent relationship. Review affected paths before changing an established Skill.",
    "Spell Construction": "Attach construction only when this Skill defines Magic. Select its framework, author the construction and review the calculator. Attaching a document does not grant that Skill to Characters.",
    "Purchased points and Rank": "Points are what a Character buys in a Skill. Rank is calculated from the existing rules and governing Attributes. These are different values.",
  } },
  derived: { title: "Derived Ability authoring", introduction: "Separate how an Ability is acquired, when it can be used, what it costs and what it does.", steps: authoring, fields: ["derived"], topics: { ...lifecycle,
    "Requirements versus Use Conditions": "Requirements say what a Character needs to gain or keep an Ability. Use Conditions say when they can use it. For a manual condition, the G.O.D. must decide whether it is met.",
    "Effects": "Add supported effects selected in the form in their intended order. Narrative Rules Text explains the Ability but does not replace the effect definition.",
    "Passive, Activated, Triggered and Reaction": "Passive contributions follow supported live eligibility. Activated actions are chosen deliberately. Triggered and Reaction abilities need an appropriate event or response window and a choice by the person using it.",
  } },
  campaign: { title: "Campaign setup", introduction: "Set the campaign's creation budgets, allowed Races, Skills and Items, people and play settings.", steps: ["Choose the campaign or create one.", "Review creation rules and allowed content before players build Characters.", "Save settings, then use campaign control to manage people and play."], fields: ["campaign"], topics: { ...lifecycle,
    "Permitted content": "Allow the Races, Skills and Items this campaign should offer. Library records remain shared definitions; allowing one does not grant it to every Character.",
    "Players and Characters": "Add the intended players and use the campaign's Character controls. Joining a campaign and having a ready Character are separate steps.",
    "Creation versus advancement": "Starting budgets govern creation. During play, use the existing awards and advancement workflows instead of editing catalog definitions to award points.",
  } },
  character: { title: "Character sheet and creation", introduction: "Build the Character from campaign-allowed Races, Skills and Items, then use the live panels to manage play.", steps: ["Choose the correct campaign and Race, and complete the identity fields.", "Purchase Attributes and Skills within the displayed budgets and racial caps.", "Add permitted equipment, review warnings and save the Character."], fields: ["character"], topics: {
    "View Form": "Normal is the default. View Form displays Forms authored for the exact selected Race, with preview Attributes, body, movement, protection, attacks, Skills and transformation definitions. Preview is local and resets on reopening. Normal editing and live controls remain below. Saving uses only your actual edits; printing uses Normal values. Damage is not redistributed into Form Anatomy.",
    "Attributes and Skill points": "Attribute values are purchased within campaign budgets and Race caps. Skill purchases follow exact parent paths and eligibility. The displayed Rank is calculated; it is not another field to buy directly.",
    "Mana and Base Magic": "A source Skill's Mana value is multiplied by effective Base Magic. For example, 5 × 3 gives 15. Permanent Character Base Magic increases use Quintessence advancement.",
    "Owned, Equipped, Worn and Wielded": "Owned quantity is inventory. Equipment states determine whether a copy can provide its effects: armor must be Worn, and weapon use must satisfy its readiness and handling requirements.",
    "Live Health, Mana and effects": "These panels track the individual's current state. Apply actual damage, healing, spending and supported effects through their controls; changing a creation budget is not the same operation.",
    "Saving versus using": "Saving edits preserves the sheet. Using an Item, casting or committing a combat action is a separate operation that may spend resources and apply outcomes.",
    "Narrative fields": "Appearance, personality, beliefs and Quirks describe the Character. They do not automatically create bonuses, conditions or Abilities.",
  } },
  npc: { title: "NPCs and Creature individuals", introduction: "Manage campaign individuals separately from their Race or Creature master definitions.", steps: ["Choose the intended campaign and NPC type.", "Select the source content and construct the individual.", "Open the individual to edit its own details, equipment and supported mechanics."], fields: ["character", "creature"], topics: {
    "Character NPC versus Creature NPC": "Character NPCs use Character creation and Race information. Creature NPCs start from a Creature definition and retain individual snapshots.",
    "Baseline and current state": "An individual's saved source snapshot and current edits are separate. Editing the master Creature does not silently update an existing NPC.",
    "Live use": "Use the individual's available actions and current resource state. The master catalog describes the source, not the individual's remaining Health or uses.",
    ...lifecycle,
  } },
  combat: { title: "Tabletop and combat", introduction: "Choose the current session, scene and encounter, then use the controls for the acting participant and current decision window.", steps: ["Check the selected campaign, encounter and participant before choosing an action.", "Choose an available source and target. Complete only the fields relevant to that action.", "Review costs and warnings before committing; commitment can spend resources and record an outcome."], topics: {
    "Initiative and Hold": "Initiative measures the time spent on actions in combat. Each action uses its listed cost. Hold is the special choice that costs zero. A blank cost means it still needs to be set, not that the action is free.",
    "Creature rewards": "Incapacitating a Creature earns the same authored XP and CR Fame as killing it. Fame goes to the credited Player Character; the G.O.D. selects the XP distribution at closeout. Each Creature in the encounter awards those rewards once, so killing it later does not pay again. Injuring only a limb does not count as incapacitating the whole Creature.",
    "Weapons and readiness": "Use Weapons to select and prepare an owned copy. Drawing, loading, firing mode and ammunition depend on its saved settings. Inventory-only Items and unprepared copies may not be available to attack.",
    "Using an Item": "Choose Item, select its ability, then choose who receives the effect. Use on myself selects your Character; Additional item target adds recipients when allowed. For an area effect, the G.O.D. chooses who is inside the area. After the action finishes, the G.O.D. reviews each result and selects Apply item effects. If damage needs a location, choose it and select Calculate damage first. Already-paid Charges are not spent again.",
    "Melee and distance": "For a melee attack, you do not need to enter a shooting distance. For a ranged attack, enter the distance to the target and make sure the weapon's range limits have been set.",
    "Physical versus digital rolls": "For physical percentile dice, enter the actual result; 00 means 100. Digital rolls are generated by the server when you commit. Previewing help does not roll dice.",
    "Targets and hit locations": "Choose the actual intended participant and any required location. Coverage and location pools matter to damage; a target's name alone does not determine protection.",
    "Defense and reactions": "Use the choices offered by the current chance to respond. These choices depend on eligibility, Initiative and supported use conditions; an authored Reaction is not always available.",
    "G.O.D. rulings": "Sometimes the game does not have enough information to decide what happens. Read the reason shown and let the G.O.D. make the decision using the control provided.",
    "Protection": "Race Natural Protection has one Soak value. Worn Armor depends on actual Worn state and coverage. Creature natural protection still has its existing Armor and Soak fields. Overlapping natural definitions require a ruling.",
    "Called checks and roll history": "A called check asks for a specified Attribute or Skill roll for the current situation. The ledger records completed results; changing an unrelated catalog field does not rewrite past rolls.",
    "Closeout and awards": "Review the encounter, scene or session being closed and the recipients of awards. Closing and finalizing are deliberate operations; inspect the confirmation before applying them.",
  } },
  magic: { title: "Magic and Spellbook", introduction: "Construct or choose Magic through the existing Skill framework, then review what the Character can actually cast.", steps: ["Choose the existing Magic source or begin the supported construction workflow.", "Review the framework, components and calculated Mana/timing.", "Choose a target and review the casting preview before committing."], topics: {
    "Construction versus casting": "Construction describes the Magic. Casting uses a Character's available source, resources, target and timing. Saving a construction does not cast it.",
    "Components and modifiers": "Choose supported effects and modifiers, then review their contribution in the calculator. Unresolved combinations need a ruling; help text does not create a missing rule.",
    "Mana": "The Character's Mana source uses its governing Skill and effective Base Magic. Available Mana is a live balance, distinct from a construction's Mana cost.",
    "Progressive Magic": "Review each authored tier and the calculator output for the selected configuration. Do not assume that repeated components or containers create an unapproved stacking rule.",
    "Spellbook entries": "Choose the intended saved entry and review its current source and construction before use. A familiar name does not guarantee identical mechanics.",
  } },
  advance: { title: "Character advancement", introduction: "Spend earned resources through the existing advancement rules and review the resulting Character changes.", steps: ["Check available advancement resources and the selected Character.", "Choose the Attribute, Skill or supported base advancement you intend to buy.", "Review the cost and resulting values before committing."], topics: {
    "Quintessence and Base Magic": "The existing Base Magic advancement buys +0.25 for 25 Quintessence. This changes the Character's effective multiplier; it does not rewrite the Race master.",
    "Skill paths": "Advance the exact allocated Skill path. Shared names and tiers do not make purchased allocations interchangeable.",
    "Caps and eligibility": "The displayed checks still apply. A narrative note or a catalog rename does not bypass an advancement requirement.",
  } },
  shop: { title: "Shops and commerce", introduction: "A shop definition and a live shop visit are different: author the shop's stock and terms, then use a visit to transact with Characters.", steps: ["Choose the campaign and the intended shop or visit.", "Review stock, quantities, prices and the participating Character.", "Confirm purchases or other supported transactions through the visit controls."], topics: {
    "Stock and Item identity": "Select an existing catalog Item for a stock entry. Quantity is what the shop offers; it is not automatically added to a Character.",
    "Price and markup": "Review the displayed purchase price and currency before confirming. An authored catalog price and a shop's transaction price may be different.",
    "Shop visits": "The G.O.D. controls the active shop visit and participant access. Players purchase through the permitted live visit, not by editing the master shop.",
    "Limits and availability": "Stock, campaign permission and the Character's balance can prevent a purchase. Read the returned reason before changing a definition.",
  } },
  town: { title: "Towns and locations", introduction: "Build places the campaign can use, then connect relevant shops and descriptive information.", steps: ["Choose or create the town/location.", "Author its identity, setting information and relevant linked places.", "Save, then use the campaign's location and shop-visit controls during play."], topics: {
    "Descriptions": "Location descriptions, atmosphere and notes help the G.O.D. present the place. They do not automatically place participants or begin encounters.",
    "Linked records": "Select actual shops or other available records when creating a relationship. Mentioning a name in prose does not create a link.",
    ...lifecycle,
  } },
  admin: { title: "Administration", introduction: "Manage account access, content oversight and the shared site appearance.", steps: ["Open the relevant administration area.", "Review the account or setting before editing.", "Use the offered save or confirmation control to apply the change."], topics: {
    "Roles and access": "Roles determine which administrative, G.O.D. and player tools an account can use. Changing a role changes access, not campaign ownership or Character data by itself.",
    "Appearance": "Choose a preset or edit shared colors and inspect the preview. Draft colors remain a preview until published; the shared theme affects the site.",
    "Account deletion": "Use the dependency preview and review any blocking records before a permanent deletion. Archiving or access changes are separate operations.",
  } },
  chat: { title: "Chat", introduction: "Choose the intended conversation before composing a message.", steps: ["Select the room or conversation you intend to use.", "Check its title and participant context.", "Write the message and use Send."], topics: {
    "Conversation and recipient": "The currently selected conversation determines who can read the message. Opening another conversation does not send the draft.",
    "Messages versus gameplay": "Chat discusses play. Writing an attack, purchase or award in a message does not execute that operation; use the corresponding game control.",
  } },
  account: { title: "Signing in and choosing a path", introduction: "Use your account to enter the paths available to your assigned roles.", steps: ["Sign in with your account, or register if you need one.", "After signing in, choose an available path on Access.", "The Heavens contains G.O.D. tools; The Realms contains player tools; Administration requires its corresponding access."], topics: {
    Username: "Use the account name requested by the sign-in form. This identifies the account; it is separate from a Character's name.",
    Password: "Enter your account password. Registration requires the form's stated password rules and confirmation; do not use a Character name as a substitute.",
    "Unavailable paths": "Access follows the account's assigned roles. Creating an account does not automatically grant administrative or G.O.D. access.",
  } },
  dashboard: { title: "Finding your way", introduction: "Use the dashboard for your current role and campaign, then open the appropriate workspace.", steps: ["Choose the campaign or content area you want to work with.", "Use the navigation and breadcrumbs to move between related screens.", "Open Help with this page for the current workflow, or use a field's ? for its specific meaning."], topics: {
    "The Heavens": "G.O.D. authoring and campaign-management tools, including Races, Creatures, Skills, Items, NPCs and tabletop operations.",
    "The Realms": "Player campaign access, Characters and the available live tabletop workflows.",
    "Access and Switch Path": "Return to Access or use Switch Path to enter another role available to your account. This does not change the selected Character's game rules.",
  } },
};

export function getPageHelp(pathname: string): PageHelp {
  let key = "dashboard";
  if (/\/(login|register|access)(\/|$)/.test(pathname)) key = "account";
  else if (pathname.startsWith("/admin")) key = "admin";
  else if (pathname.startsWith("/chat")) key = "chat";
  else if (/\/advance(?:\/|$)/.test(pathname)) key = "advance";
  else if (/\/(magic|spellbook)(\/|$)/.test(pathname)) key = "magic";
  else if (/\/(tabletop|encounter)(\/|$)/.test(pathname)) key = "combat";
  else if (/\/races(?:\/|$)/.test(pathname)) key = "race";
  else if (/\/creatures(?:\/|$)/.test(pathname)) key = "creature";
  else if (/\/npcs(?:\/|$)/.test(pathname)) key = "npc";
  else if (/\/(equipment|inventory)(\/|$)/.test(pathname)) key = "item";
  else if (/\/derived-abilities(?:\/|$)/.test(pathname)) key = "derived";
  else if (/\/skills(?:\/|$)/.test(pathname)) key = "skill";
  else if (/\/campaigns(?:\/|$)/.test(pathname)) key = "campaign";
  else if (/\/characters(?:\/|$)/.test(pathname)) key = "character";
  else if (/\/shops(?:\/|$)/.test(pathname)) key = "shop";
  else if (/\/towns(?:\/|$)/.test(pathname)) key = "town";
  return guides[key];
}

export function pageHelpTopics(guide: PageHelp): Array<[string, string]> {
  return Object.entries({ ...Object.assign({}, ...(guide.fields ?? []).map((scope) => FIELD_HELP[scope])), ...guide.topics });
}
