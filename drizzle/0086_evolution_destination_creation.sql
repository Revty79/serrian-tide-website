CREATE TABLE "evolution_destination_creation" (
	"request_key" text PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evolution_destination_creation_identity" CHECK (length("evolution_destination_creation"."request_key") = 36 AND length("evolution_destination_creation"."request_hash") = 64 AND length(trim("evolution_destination_creation"."actor_user_id")) > 0),
	CONSTRAINT "evolution_destination_creation_result" CHECK (jsonb_typeof("evolution_destination_creation"."result") = 'object' AND "evolution_destination_creation"."result"->>'kind' IN ('race','creature'))
);
