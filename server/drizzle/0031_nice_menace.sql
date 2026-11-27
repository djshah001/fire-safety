ALTER TABLE "boq_lines" ADD COLUMN "sort_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN "sort_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "boq_lines" SET "sort_order" = "line_number";--> statement-breakpoint
UPDATE "quotation_lines" SET "sort_order" = "line_number";--> statement-breakpoint
CREATE INDEX "boq_lines_company_rev_sort_idx" ON "boq_lines" USING btree ("company_id","boq_revision_id","sort_order");--> statement-breakpoint
CREATE INDEX "quotation_lines_company_rev_sort_idx" ON "quotation_lines" USING btree ("company_id","quotation_revision_id","sort_order");--> statement-breakpoint
ALTER TABLE "boq_lines" ADD CONSTRAINT "boq_lines_sort_positive" CHECK ("boq_lines"."sort_order" > 0);--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_sort_positive" CHECK ("quotation_lines"."sort_order" > 0);--> statement-breakpoint
UPDATE "boq_lines" SET "sort_order" = "line_number";--> statement-breakpoint
UPDATE "quotation_lines" SET "sort_order" = "line_number";

