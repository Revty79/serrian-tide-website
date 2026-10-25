ALTER TABLE "world_place_person" ALTER COLUMN "resident_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "world_creation_operation" ADD COLUMN "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "world_place_person" ADD COLUMN "individual_id" text;--> statement-breakpoint
ALTER TABLE "world_place_person" ADD COLUMN "individual_family" text DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_town_place" ADD COLUMN "place_kind" text DEFAULT 'place-of-interest' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_place_person" ADD CONSTRAINT "world_place_person_individual_fk" FOREIGN KEY ("individual_id","world_id","individual_family") REFERENCES "public"."world_lore_identity"("id","world_id","family") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_place_person" ADD CONSTRAINT "world_place_person_individual_uq" UNIQUE("geography_id","individual_id");--> statement-breakpoint
ALTER TABLE "world_place_person" ADD CONSTRAINT "world_place_person_identity_valid" CHECK (num_nonnulls("world_place_person"."resident_id","world_place_person"."individual_id")=1 AND "world_place_person"."individual_family"='individual');--> statement-breakpoint
ALTER TABLE "world_town_place" ADD CONSTRAINT "world_town_place_kind_valid" CHECK ("world_town_place"."place_kind" IN ('place-of-interest','building'));