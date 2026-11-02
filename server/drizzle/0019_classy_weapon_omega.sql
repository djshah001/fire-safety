CREATE TABLE "item_brand_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"brand_id" uuid,
	"manufacturer_model" varchar(120) NOT NULL,
	"manufacturer_sku" varchar(100),
	"is_preferred" boolean DEFAULT false NOT NULL,
	"status" "master_status" DEFAULT 'active' NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_brand_offerings_model_required" CHECK (length(trim("item_brand_offerings"."manufacturer_model")) > 0),
	CONSTRAINT "item_brand_offerings_row_version_positive" CHECK ("item_brand_offerings"."row_version" > 0)
);
--> statement-breakpoint
DROP INDEX "item_rate_versions_item_currency_date_uidx";--> statement-breakpoint
DROP INDEX "estimate_lines_revision_boq_line_uidx";--> statement-breakpoint
INSERT INTO "item_brand_offerings" ("company_id", "item_id", "brand_id", "manufacturer_model", "is_preferred", "created_by_user_id")
SELECT ranked.company_id, ranked.item_id, ranked.brand_id, ranked.manufacturer_model, ranked.preference_rank = 1, ranked.created_by_user_id
FROM (
	SELECT i.company_id, i.id AS item_id, ib.brand_id,
		coalesce(nullif(trim(i.model), ''), i.code) AS manufacturer_model,
		i.created_by_user_id,
		row_number() OVER (PARTITION BY i.id ORDER BY (ib.brand_id = i.costing_brand_id) DESC, ib.brand_id) AS preference_rank
	FROM "items" i
	INNER JOIN "item_brands" ib ON ib.item_id = i.id AND ib.company_id = i.company_id
) ranked;--> statement-breakpoint
INSERT INTO "item_brand_offerings" ("company_id", "item_id", "brand_id", "manufacturer_model", "is_preferred", "created_by_user_id")
SELECT i.company_id, i.id, null, coalesce(nullif(trim(i.model), ''), i.code), true, i.created_by_user_id
FROM "items" i
WHERE NOT EXISTS (SELECT 1 FROM "item_brand_offerings" o WHERE o.item_id = i.id);--> statement-breakpoint
ALTER TABLE "item_rate_versions" ADD COLUMN "offering_id" uuid;--> statement-breakpoint
UPDATE "item_rate_versions" r SET "offering_id" = o.id
FROM "item_brand_offerings" o
WHERE o.item_id = r.item_id AND o.is_preferred = true AND o.status = 'active';--> statement-breakpoint
ALTER TABLE "item_rate_versions" ALTER COLUMN "offering_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD COLUMN "offering_id" uuid;--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD COLUMN "brand_id_snapshot" uuid;--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD COLUMN "brand_name_snapshot" varchar(120);--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD COLUMN "manufacturer_model_snapshot" varchar(120);--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD COLUMN "manufacturer_sku_snapshot" varchar(100);--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD COLUMN "is_preferred_offering_snapshot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "offering_id" uuid;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "boq_cost_option_id" uuid;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "manufacturer_model_snapshot" varchar(120);--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "manufacturer_sku_snapshot" varchar(100);--> statement-breakpoint
ALTER TABLE "item_brand_offerings" ADD CONSTRAINT "item_brand_offerings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_brand_offerings" ADD CONSTRAINT "item_brand_offerings_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_brand_offerings" ADD CONSTRAINT "item_brand_offerings_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_brand_offerings" ADD CONSTRAINT "item_brand_offerings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_brand_offerings_identity_uidx" ON "item_brand_offerings" USING btree ("item_id","brand_id","manufacturer_model");--> statement-breakpoint
CREATE INDEX "item_brand_offerings_company_item_idx" ON "item_brand_offerings" USING btree ("company_id","item_id","status");--> statement-breakpoint
CREATE INDEX "item_brand_offerings_company_brand_idx" ON "item_brand_offerings" USING btree ("company_id","brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_brand_offerings_preferred_uidx" ON "item_brand_offerings" USING btree ("item_id") WHERE "item_brand_offerings"."is_preferred" = true and "item_brand_offerings"."status" = 'active';--> statement-breakpoint
ALTER TABLE "item_rate_versions" ADD CONSTRAINT "item_rate_versions_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD CONSTRAINT "estimate_cost_lines_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_cost_lines" ADD CONSTRAINT "estimate_cost_lines_brand_id_snapshot_brands_id_fk" FOREIGN KEY ("brand_id_snapshot") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_offering_id_item_brand_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."item_brand_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_boq_cost_option_id_estimate_cost_lines_id_fk" FOREIGN KEY ("boq_cost_option_id") REFERENCES "public"."estimate_cost_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_rate_versions_offering_currency_date_uidx" ON "item_rate_versions" USING btree ("offering_id","currency","effective_from");--> statement-breakpoint
CREATE INDEX "item_rate_versions_company_item_idx" ON "item_rate_versions" USING btree ("company_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estimate_lines_revision_boq_offering_uidx" ON "estimate_cost_lines" USING btree ("boq_revision_id","boq_line_id","offering_id") WHERE "estimate_cost_lines"."boq_line_id" is not null and "estimate_cost_lines"."rate_version_id" is not null and "estimate_cost_lines"."offering_id" is not null;
