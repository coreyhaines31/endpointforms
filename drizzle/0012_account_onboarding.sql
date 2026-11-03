CREATE TABLE "email_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verdict_api_keys" ADD COLUMN "scopes" text[] DEFAULT '{outcomes:write}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "verdict_api_keys" ADD COLUMN "created_via" text DEFAULT 'settings' NOT NULL;--> statement-breakpoint
ALTER TABLE "verdict_api_keys" ADD COLUMN "client_name" text;--> statement-breakpoint
CREATE INDEX "email_codes_email_created_idx" ON "email_codes" USING btree ("email","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "verdict_api_keys" ADD CONSTRAINT "verdict_api_keys_created_via" CHECK ("verdict_api_keys"."created_via" in ('settings', 'mcp'));