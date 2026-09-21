ALTER TABLE "race_natural_protections" DROP CONSTRAINT "race_natural_protection_amounts_valid";--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "parent_race_id" integer;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_parent_race_id_races_id_fk" FOREIGN KEY ("parent_race_id") REFERENCES "public"."races"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "races_parent_race_idx" ON "races" USING btree ("parent_race_id");--> statement-breakpoint
ALTER TABLE "race_natural_protections" DROP COLUMN "natural_armor";--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_parent_not_self" CHECK ("races"."parent_race_id" IS NULL OR "races"."parent_race_id" <> "races"."id");--> statement-breakpoint
ALTER TABLE "race_natural_protections" ADD CONSTRAINT "race_natural_protection_amounts_valid" CHECK ("race_natural_protections"."natural_soak" >= 0 AND "race_natural_protections"."natural_soak" < 'Infinity'::float8);