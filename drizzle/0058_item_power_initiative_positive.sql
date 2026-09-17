DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "item_powers" WHERE "initiative_cost" = 0) THEN
		RAISE EXCEPTION 'Cannot tighten Item Power Initiative validation while zero-valued Item Powers exist.';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "item_powers" DROP CONSTRAINT "item_powers_initiative_valid";
--> statement-breakpoint
ALTER TABLE "item_powers" ADD CONSTRAINT "item_powers_initiative_valid" CHECK ("initiative_cost" IS NULL OR "initiative_cost" > 0);