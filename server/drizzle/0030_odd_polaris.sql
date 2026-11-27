ALTER TABLE "leads" ADD COLUMN "updated_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "design_jobs" ADD COLUMN "updated_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_jobs" ADD CONSTRAINT "design_jobs_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_company_updated_by_idx" ON "leads" USING btree ("company_id","updated_by_user_id");--> statement-breakpoint
CREATE INDEX "design_jobs_company_updated_by_idx" ON "design_jobs" USING btree ("company_id","updated_by_user_id");--> statement-breakpoint
UPDATE "leads" l SET "updated_by_user_id" = COALESCE(
  (SELECT ae."actor_user_id" FROM "audit_events" ae
   WHERE ae."company_id" = l."company_id" AND ae."target_type" = 'lead' AND ae."target_id" = l."id" AND ae."actor_user_id" IS NOT NULL
   ORDER BY ae."occurred_at" DESC LIMIT 1),
  l."created_by_user_id"
) WHERE l."updated_by_user_id" IS NULL;--> statement-breakpoint
UPDATE "design_jobs" dj SET "updated_by_user_id" = COALESCE(
  (SELECT ae."actor_user_id" FROM "audit_events" ae
   WHERE ae."company_id" = dj."company_id"
     AND ((ae."target_type" = 'design_job' AND ae."target_id" = dj."id")
       OR (ae."target_type" IN ('design_revision', 'survey_revision') AND ae."metadata"->>'designJobId' = dj."id"::text))
     AND ae."actor_user_id" IS NOT NULL
   ORDER BY ae."occurred_at" DESC LIMIT 1),
  dj."authorized_by_user_id"
) WHERE dj."updated_by_user_id" IS NULL;