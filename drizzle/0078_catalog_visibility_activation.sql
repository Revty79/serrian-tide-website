CREATE TABLE "catalog_visibility_activation" (
	"manifest_hash" text PRIMARY KEY NOT NULL,
	"classified_at" timestamp DEFAULT now() NOT NULL
);
