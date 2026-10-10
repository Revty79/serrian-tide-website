CREATE TABLE "user_password_recovery_code" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_password_recovery_code" ADD CONSTRAINT "user_password_recovery_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_password_recovery_code_user_idx" ON "user_password_recovery_code" USING btree ("user_id");