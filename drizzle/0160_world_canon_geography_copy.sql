CREATE TABLE "world_canon_copy" (
	"request_id" text PRIMARY KEY NOT NULL,
	"source_world_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"target_world_id" text NOT NULL,
	"target_timeline_id" text NOT NULL,
	"phase" integer DEFAULT 0 NOT NULL,
	"cursor" text DEFAULT '' NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'preparing' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_canon_copy_target_world_id_unique" UNIQUE("target_world_id"),
	CONSTRAINT "world_canon_copy_actor_request_uq" UNIQUE("request_id","actor_id"),
	CONSTRAINT "world_canon_copy_valid" CHECK ("world_canon_copy"."input_hash" ~ '^[a-f0-9]{64}$' AND "world_canon_copy"."phase">=0 AND "world_canon_copy"."rows">=0 AND length("world_canon_copy"."cursor")<=512 AND "world_canon_copy"."status" IN ('preparing','accepted'))
);
--> statement-breakpoint
CREATE TABLE "world_canon_copy_identity" (
	"request_id" text NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	CONSTRAINT "world_canon_copy_identity_request_id_source_id_pk" PRIMARY KEY("request_id","source_id"),
	CONSTRAINT "world_canon_copy_target_identity_uq" UNIQUE("request_id","target_id")
);
--> statement-breakpoint
CREATE TABLE "world_canon_copy_row" (
	"request_id" text NOT NULL,
	"family" text NOT NULL,
	"record_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"ready" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "world_canon_copy_row_request_id_family_record_key_pk" PRIMARY KEY("request_id","family","record_key"),
	CONSTRAINT "world_canon_copy_row_valid" CHECK ("world_canon_copy_row"."ready" IN (0,1) AND length("world_canon_copy_row"."family") BETWEEN 1 AND 80 AND length("world_canon_copy_row"."record_key") BETWEEN 1 AND 512 AND jsonb_typeof("world_canon_copy_row"."payload")='object' AND octet_length("world_canon_copy_row"."payload"::text)<=16777216)
);
--> statement-breakpoint
ALTER TABLE "world_canon_copy" ADD CONSTRAINT "world_canon_copy_source_world_id_world_id_fk" FOREIGN KEY ("source_world_id") REFERENCES "public"."world"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_canon_copy" ADD CONSTRAINT "world_canon_copy_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_canon_copy_identity" ADD CONSTRAINT "world_canon_copy_identity_request_id_world_canon_copy_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."world_canon_copy"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_canon_copy_row" ADD CONSTRAINT "world_canon_copy_row_request_id_world_canon_copy_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."world_canon_copy"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_canon_copy_actor_idx" ON "world_canon_copy" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "world_canon_copy_pending_idx" ON "world_canon_copy_row" USING btree ("request_id","ready","family","record_key");