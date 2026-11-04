CREATE TABLE "vendor_price_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"inquiry_code" varchar(20) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" varchar(1000),
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"response_due_date" date,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_price_inquiry_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"whatsapp_number" varchar(30),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"msg91_message_id" varchar(100),
	"sent_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_price_inquiry_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" uuid NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"item_ref" jsonb NOT NULL,
	"unit_rate" numeric(18, 4) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"lead_time_days" integer,
	"notes" varchar(500),
	"moq" numeric(18, 4),
	"valid_until" date,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor_price_inquiries" ADD CONSTRAINT "vendor_price_inquiries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_inquiries" ADD CONSTRAINT "vendor_price_inquiries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_inquiry_invitations" ADD CONSTRAINT "vendor_price_inquiry_invitations_inquiry_id_vendor_price_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."vendor_price_inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_inquiry_invitations" ADD CONSTRAINT "vendor_price_inquiry_invitations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_inquiry_invitations" ADD CONSTRAINT "vendor_price_inquiry_invitations_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_inquiry_responses" ADD CONSTRAINT "vendor_price_inquiry_responses_invitation_id_vendor_price_inquiry_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."vendor_price_inquiry_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_inquiry_responses" ADD CONSTRAINT "vendor_price_inquiry_responses_inquiry_id_vendor_price_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."vendor_price_inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_inquiry_responses" ADD CONSTRAINT "vendor_price_inquiry_responses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_inquiry_responses" ADD CONSTRAINT "vendor_price_inquiry_responses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vpi_company_code_uidx" ON "vendor_price_inquiries" USING btree ("company_id","inquiry_code");--> statement-breakpoint
CREATE INDEX "vpi_company_status_idx" ON "vendor_price_inquiries" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "vpii_token_uidx" ON "vendor_price_inquiry_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "vpii_inquiry_idx" ON "vendor_price_inquiry_invitations" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "vpii_vendor_idx" ON "vendor_price_inquiry_invitations" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vpir_inquiry_vendor_idx" ON "vendor_price_inquiry_responses" USING btree ("inquiry_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vpir_invitation_idx" ON "vendor_price_inquiry_responses" USING btree ("invitation_id");

