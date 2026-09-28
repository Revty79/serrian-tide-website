CREATE TABLE "catalog_visibility_scope_activation" (
	"catalog_key" text PRIMARY KEY NOT NULL,
	"activated_at" timestamp DEFAULT now() NOT NULL,
	"activated_by_user_id" text,
	"activation_method" text NOT NULL,
	"manifest_hash" text,
	CONSTRAINT "catalog_scope_activation_key_valid" CHECK ("catalog_visibility_scope_activation"."catalog_key" IN ('race', 'creature', 'skill', 'derivedAbility', 'equipment', 'inventory')),
	CONSTRAINT "catalog_scope_activation_method_valid" CHECK (("catalog_visibility_scope_activation"."activation_method" = 'manual' AND "catalog_visibility_scope_activation"."activated_by_user_id" IS NOT NULL AND "catalog_visibility_scope_activation"."manifest_hash" IS NULL) OR ("catalog_visibility_scope_activation"."activation_method" = 'classified-manifest' AND "catalog_visibility_scope_activation"."manifest_hash" IS NOT NULL AND "catalog_visibility_scope_activation"."catalog_key" IN ('race', 'creature', 'skill', 'derivedAbility')))
);
--> statement-breakpoint
ALTER TABLE "catalog_visibility_scope_activation" ADD CONSTRAINT "catalog_scope_activation_actor_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- Preserve the approved Pass 3 receipt. Its original format did not identify an actor.
-- This establishes readiness only; no definitions or canon designations change.
INSERT INTO catalog_visibility_scope_activation (catalog_key, activated_at, activated_by_user_id, activation_method, manifest_hash)
SELECT scopes.catalog_key, receipt.classified_at, NULL, 'classified-manifest', receipt.manifest_hash
FROM catalog_visibility_activation receipt
CROSS JOIN (VALUES ('race'), ('creature'), ('skill'), ('derivedAbility')) scopes(catalog_key)
WHERE receipt.manifest_hash = '26e5281a043b824a13295acf76b6f819bd3abf28e00602a6eac097279b47472c'
ON CONFLICT (catalog_key) DO NOTHING;
