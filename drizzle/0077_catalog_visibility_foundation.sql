CREATE TABLE "user_catalog_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"race_visibility" text DEFAULT 'canon-and-mine' NOT NULL,
	"creature_visibility" text DEFAULT 'canon-and-mine' NOT NULL,
	"skill_visibility" text DEFAULT 'canon-and-mine' NOT NULL,
	"derived_ability_visibility" text DEFAULT 'canon-and-mine' NOT NULL,
	"equipment_visibility" text DEFAULT 'canon-and-mine' NOT NULL,
	"inventory_visibility" text DEFAULT 'canon-and-mine' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_catalog_preferences_race_valid" CHECK ("user_catalog_preferences"."race_visibility" IN ('canon', 'canon-and-mine', 'mine')),
	CONSTRAINT "user_catalog_preferences_creature_valid" CHECK ("user_catalog_preferences"."creature_visibility" IN ('canon', 'canon-and-mine', 'mine')),
	CONSTRAINT "user_catalog_preferences_skill_valid" CHECK ("user_catalog_preferences"."skill_visibility" IN ('canon', 'canon-and-mine', 'mine')),
	CONSTRAINT "user_catalog_preferences_derived_ability_valid" CHECK ("user_catalog_preferences"."derived_ability_visibility" IN ('canon', 'canon-and-mine', 'mine')),
	CONSTRAINT "user_catalog_preferences_equipment_valid" CHECK ("user_catalog_preferences"."equipment_visibility" IN ('canon', 'canon-and-mine', 'mine')),
	CONSTRAINT "user_catalog_preferences_inventory_valid" CHECK ("user_catalog_preferences"."inventory_visibility" IN ('canon', 'canon-and-mine', 'mine'))
);
--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "is_system_canon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "canon_marked_by_user_id" text;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "canon_marked_at" timestamp;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "is_system_canon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "canon_marked_by_user_id" text;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "canon_marked_at" timestamp;--> statement-breakpoint
ALTER TABLE "creatures" ADD COLUMN "is_system_canon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "creatures" ADD COLUMN "canon_marked_by_user_id" text;--> statement-breakpoint
ALTER TABLE "creatures" ADD COLUMN "canon_marked_at" timestamp;--> statement-breakpoint
ALTER TABLE "derived_ability" ADD COLUMN "is_system_canon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "derived_ability" ADD COLUMN "canon_marked_by_user_id" text;--> statement-breakpoint
ALTER TABLE "derived_ability" ADD COLUMN "canon_marked_at" timestamp;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_system_canon" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "canon_marked_by_user_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "canon_marked_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_catalog_preferences" ADD CONSTRAINT "user_catalog_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_canon_marked_by_user_id_user_id_fk" FOREIGN KEY ("canon_marked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_canon_marked_by_user_id_user_id_fk" FOREIGN KEY ("canon_marked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_canon_marked_by_user_id_user_id_fk" FOREIGN KEY ("canon_marked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_ability" ADD CONSTRAINT "derived_ability_canon_marked_by_user_id_user_id_fk" FOREIGN KEY ("canon_marked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_canon_marked_by_user_id_user_id_fk" FOREIGN KEY ("canon_marked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill" ADD CONSTRAINT "skill_canon_state_valid" CHECK ((
    ("skill"."is_system_canon" = false AND "skill"."canon_marked_by_user_id" IS NULL AND "skill"."canon_marked_at" IS NULL)
    OR ("skill"."is_system_canon" = true AND "skill"."canon_marked_by_user_id" IS NOT NULL AND "skill"."canon_marked_at" IS NOT NULL)
  ));--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_canon_state_valid" CHECK ((
    ("races"."is_system_canon" = false AND "races"."canon_marked_by_user_id" IS NULL AND "races"."canon_marked_at" IS NULL)
    OR ("races"."is_system_canon" = true AND "races"."canon_marked_by_user_id" IS NOT NULL AND "races"."canon_marked_at" IS NOT NULL)
  ));--> statement-breakpoint
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_canon_state_valid" CHECK ((
    ("creatures"."is_system_canon" = false AND "creatures"."canon_marked_by_user_id" IS NULL AND "creatures"."canon_marked_at" IS NULL)
    OR ("creatures"."is_system_canon" = true AND "creatures"."canon_marked_by_user_id" IS NOT NULL AND "creatures"."canon_marked_at" IS NOT NULL)
  ));--> statement-breakpoint
ALTER TABLE "derived_ability" ADD CONSTRAINT "derived_ability_canon_state_valid" CHECK ((
    ("derived_ability"."is_system_canon" = false AND "derived_ability"."canon_marked_by_user_id" IS NULL AND "derived_ability"."canon_marked_at" IS NULL)
    OR ("derived_ability"."is_system_canon" = true AND "derived_ability"."canon_marked_by_user_id" IS NOT NULL AND "derived_ability"."canon_marked_at" IS NOT NULL)
  ));--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_canon_state_valid" CHECK ((
    ("items"."is_system_canon" = false AND "items"."canon_marked_by_user_id" IS NULL AND "items"."canon_marked_at" IS NULL)
    OR ("items"."is_system_canon" = true AND "items"."canon_marked_by_user_id" IS NOT NULL AND "items"."canon_marked_at" IS NOT NULL)
  ));