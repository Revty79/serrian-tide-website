CREATE TABLE "site_appearance_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"preset_id" text NOT NULL,
	"page_background" text NOT NULL,
	"surface_background" text NOT NULL,
	"primary_accent" text NOT NULL,
	"secondary_accent" text NOT NULL,
	"main_text" text NOT NULL,
	"muted_text" text NOT NULL,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_appearance_singleton_key" CHECK ("site_appearance_setting"."key" = 'site'),
	CONSTRAINT "site_appearance_preset_valid" CHECK ("site_appearance_setting"."preset_id" IN ('serrian-tide', 'classic')),
	CONSTRAINT "site_appearance_page_background_hex" CHECK ("site_appearance_setting"."page_background" ~ '^#[0-9A-F]{6}$'),
	CONSTRAINT "site_appearance_surface_background_hex" CHECK ("site_appearance_setting"."surface_background" ~ '^#[0-9A-F]{6}$'),
	CONSTRAINT "site_appearance_primary_accent_hex" CHECK ("site_appearance_setting"."primary_accent" ~ '^#[0-9A-F]{6}$'),
	CONSTRAINT "site_appearance_secondary_accent_hex" CHECK ("site_appearance_setting"."secondary_accent" ~ '^#[0-9A-F]{6}$'),
	CONSTRAINT "site_appearance_main_text_hex" CHECK ("site_appearance_setting"."main_text" ~ '^#[0-9A-F]{6}$'),
	CONSTRAINT "site_appearance_muted_text_hex" CHECK ("site_appearance_setting"."muted_text" ~ '^#[0-9A-F]{6}$')
);
--> statement-breakpoint
ALTER TABLE "site_appearance_setting" ADD CONSTRAINT "site_appearance_setting_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;