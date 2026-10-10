ALTER TABLE "roles" ADD COLUMN "row_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_row_version_positive" CHECK ("roles"."row_version" > 0);