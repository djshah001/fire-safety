import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Eye, FileText, Paperclip } from "lucide-react";

import { getApiErrorMessage } from "@/api/client";
import {
  downloadOpportunityAttachment,
  opportunityAttachmentPreviewUrl,
  opportunityAttachmentsQuery,
  uploadOpportunityAttachments,
  type OpportunityAttachment,
} from "@/api/crm";
import { FileDropzone } from "@/components/FileDropzone";
import { isImageFile, UploadedFilePreviewDialog } from "@/components/ImagePreview";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const OPPORTUNITY_ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);
const OPPORTUNITY_ALLOWED_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png"]);

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function OpportunityDocumentsCard({
  opportunityId,
  canUpload = false,
  title = "Opportunity / Client Documents",
  description = "Shared drawings, RFPs, and site photos accessible by CRM and assigned Engineering staff.",
  compact = false,
  className,
}: {
  opportunityId: string;
  canUpload?: boolean;
  title?: string;
  description?: string;
  compact?: boolean;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [previewDoc, setPreviewDoc] = useState<OpportunityAttachment>();
  const documents = useQuery(opportunityAttachmentsQuery(opportunityId));

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => uploadOpportunityAttachments(opportunityId, files),
    async onSuccess(items) {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["crm", "opportunity", opportunityId, "attachments"],
        }),
        queryClient.invalidateQueries({ queryKey: ["crm", "opportunities"] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
      ]);
      toast.success(
        `${items.length} opportunity document${items.length === 1 ? "" : "s"} uploaded.`,
      );
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const docs = documents.data ?? [];

  return (
    <>
      <Card className={cn("shadow-2xs", className)}>
        <CardHeader className="p-4 pb-2 flex-row items-start justify-between gap-2">
          <div className="space-y-0.5">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Paperclip className="size-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
          <Badge variant="secondary" className="text-[11px] shrink-0">
            {docs.length} file{docs.length === 1 ? "" : "s"}
          </Badge>
        </CardHeader>

        <CardContent className="p-4 pt-2 space-y-3">
          {canUpload && (
            <FileDropzone
              id={`opp-docs-upload-${opportunityId}`}
              label="Drag & drop opportunity documents, or click to upload"
              hint="PDF, JPEG, or PNG up to 20 MiB each (max 10 files per batch)."
              accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
              allowedMimeTypes={OPPORTUNITY_ALLOWED_MIME}
              allowedExtensions={OPPORTUNITY_ALLOWED_EXT}
              maxFiles={10}
              uploading={uploadMutation.isPending}
              showPreviews={false}
              compact
              onFilesSelected={(selected) => uploadMutation.mutate(selected)}
            />
          )}

          {documents.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : documents.isError ? (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                {getApiErrorMessage(documents.error)}
              </AlertDescription>
            </Alert>
          ) : docs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">
              {canUpload
                ? "No opportunity documents yet. Drop files above to share with CRM & Engineering."
                : "No opportunity documents have been uploaded yet."}
            </p>
          ) : (
            <div
              className={cn(
                "grid gap-2.5",
                compact ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              {docs.map((doc) => {
                const isImage = isImageFile(doc.mimeType, doc.originalName);
                return (
                  <div
                    key={doc.id}
                    className="flex flex-col justify-between gap-2 rounded-lg border bg-muted/20 p-2.5 text-xs"
                  >
                    {isImage && (
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        className="overflow-hidden rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <img
                          src={opportunityAttachmentPreviewUrl(opportunityId, doc.id)}
                          alt={doc.originalName}
                          className={cn(
                            "w-full object-cover transition-transform hover:scale-[1.02]",
                            compact ? "h-28" : "h-36",
                          )}
                        />
                      </button>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {!isImage && <FileText className="size-4 text-rose-500 shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">
                            {doc.originalName}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono truncate">
                            {formatFileSize(doc.sizeBytes)}
                            {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Preview ${doc.originalName}`}
                          onClick={() => setPreviewDoc(doc)}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Download ${doc.originalName}`}
                          onClick={() =>
                            void downloadOpportunityAttachment(opportunityId, doc).catch((error) =>
                              toast.error(getApiErrorMessage(error)),
                            )
                          }
                        >
                          <Download className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <UploadedFilePreviewDialog
        open={Boolean(previewDoc)}
        onOpenChange={(open) => !open && setPreviewDoc(undefined)}
        title={previewDoc?.originalName}
        description="Sandboxed opportunity document preview"
        src={
          previewDoc ? opportunityAttachmentPreviewUrl(opportunityId, previewDoc.id) : undefined
        }
        mimeType={previewDoc?.mimeType}
        onDownload={
          previewDoc
            ? () =>
                void downloadOpportunityAttachment(opportunityId, previewDoc).catch((error) =>
                  toast.error(getApiErrorMessage(error)),
                )
            : undefined
        }
      />
    </>
  );
}
