CREATE TYPE "public"."substitution_decision" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TABLE "procurement_substitution_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vendor_offer_line_id" uuid NOT NULL,
	"decision" "substitution_decision" NOT NULL,
	"reason" varchar(2000) NOT NULL,
	"reviewed_by_user_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_substitution_reviews_reason_required" CHECK (length(trim("procurement_substitution_reviews"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "procurement_substitution_reviews" ADD CONSTRAINT "procurement_substitution_reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_substitution_reviews" ADD CONSTRAINT "procurement_substitution_reviews_vendor_offer_line_id_vendor_offer_lines_id_fk" FOREIGN KEY ("vendor_offer_line_id") REFERENCES "public"."vendor_offer_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_substitution_reviews" ADD CONSTRAINT "procurement_substitution_reviews_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_substitution_reviews_line_uidx" ON "procurement_substitution_reviews" USING btree ("vendor_offer_line_id");--> statement-breakpoint
CREATE INDEX "procurement_substitution_reviews_company_idx" ON "procurement_substitution_reviews" USING btree ("company_id","reviewed_at");
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
	('procurement.substitution.review', 'Approve or reject technical offer deviations as the assigned project design head.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "roles"."id", 'procurement.substitution.review'
FROM "roles" WHERE "roles"."code" = 'design_head'
ON CONFLICT DO NOTHING;
