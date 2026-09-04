CREATE TABLE "campaign_character_weapon_override" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"weapon_profile_id" integer NOT NULL,
	"firing_mode_id" integer,
	"skill_allocation_id" integer,
	"attribute_key" text,
	"reason" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_character_weapon_override_one_source" CHECK ((
        ("campaign_character_weapon_override"."skill_allocation_id" IS NOT NULL AND "campaign_character_weapon_override"."attribute_key" IS NULL)
        OR
        ("campaign_character_weapon_override"."skill_allocation_id" IS NULL AND "campaign_character_weapon_override"."attribute_key" IS NOT NULL)
      )),
	CONSTRAINT "campaign_character_weapon_override_attribute_valid" CHECK ("campaign_character_weapon_override"."attribute_key" IS NULL OR "campaign_character_weapon_override"."attribute_key" IN ('STR','DEX','CON','INT','WIS','CHR')),
	CONSTRAINT "campaign_character_weapon_override_reason_valid" CHECK (length(trim("campaign_character_weapon_override"."reason")) > 0 AND length("campaign_character_weapon_override"."reason") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_id_item_uq" UNIQUE("id","item_id");--> statement-breakpoint
ALTER TABLE "campaign_character_weapon_override" ADD CONSTRAINT "campaign_character_weapon_override_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_weapon_override" ADD CONSTRAINT "campaign_character_weapon_override_character_id_campaign_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."campaign_character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_weapon_override" ADD CONSTRAINT "campaign_character_weapon_override_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_weapon_override" ADD CONSTRAINT "campaign_character_weapon_override_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_weapon_override" ADD CONSTRAINT "campaign_character_weapon_override_character_campaign_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."campaign_character"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_weapon_override" ADD CONSTRAINT "campaign_character_weapon_override_profile_item_fk" FOREIGN KEY ("weapon_profile_id","item_id") REFERENCES "public"."weapon_profiles"("id","item_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_weapon_override" ADD CONSTRAINT "campaign_character_weapon_override_mode_profile_fk" FOREIGN KEY ("firing_mode_id","weapon_profile_id") REFERENCES "public"."weapon_firing_modes"("id","weapon_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_weapon_override" ADD CONSTRAINT "campaign_character_weapon_override_allocation_character_fk" FOREIGN KEY ("skill_allocation_id","character_id") REFERENCES "public"."campaign_character_skill_allocation"("id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_character_weapon_override" ADD CONSTRAINT "campaign_character_weapon_override_attribute_character_fk" FOREIGN KEY ("character_id","attribute_key") REFERENCES "public"."campaign_character_attribute"("character_id","attribute_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_character_weapon_override_weapon_scope_uq" ON "campaign_character_weapon_override" USING btree ("campaign_id","character_id","weapon_profile_id") WHERE "campaign_character_weapon_override"."firing_mode_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_character_weapon_override_mode_scope_uq" ON "campaign_character_weapon_override" USING btree ("campaign_id","character_id","weapon_profile_id","firing_mode_id") WHERE "campaign_character_weapon_override"."firing_mode_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "campaign_character_weapon_override_lookup_idx" ON "campaign_character_weapon_override" USING btree ("campaign_id","character_id","weapon_profile_id","firing_mode_id");
