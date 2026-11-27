import { useRef, useState } from "react";
import {
  FileCode2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { isImageFile, LocalImageThumb } from "@/components/ImagePreview";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function fileExtension(name: string) {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

function fileIconFor(file: File) {
  const ext = fileExtension(file.name);
  if (file.type === "application/pdf" || ext === ".pdf") {
    return <FileText className="size-4 text-rose-500 shrink-0" />;
  }
  if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") {
    return <FileSpreadsheet className="size-4 text-emerald-600 shrink-0" />;
  }
  if (ext === ".dwg" || ext === ".dxf") {
    return <FileCode2 className="size-4 text-blue-600 shrink-0" />;
  }
  return <FileText className="size-4 text-primary shrink-0" />;
}

export type FileDropzoneProps = {
  id?: string;
  label?: string;
  hint?: string;
  accept?: string;
  allowedMimeTypes?: ReadonlySet<string>;
  allowedExtensions?: ReadonlySet<string>;
  maxFileBytes?: number;
  maxFiles?: number;
  multiple?: boolean;
  files?: File[];
  onFilesChange?: (files: File[]) => void;
  onFilesSelected?: (files: File[]) => void;
  disabled?: boolean;
  uploading?: boolean;
  compact?: boolean;
  showPreviews?: boolean;
  className?: string;
};

/**
 * Reusable drag-and-drop and click-to-browse file uploader built on workspace UI primitives.
 * Supports controlled queue mode (`files` + `onFilesChange`) and immediate upload mode (`onFilesSelected`).
 */
export function FileDropzone({
  id,
  label = "Drag & drop files here, or browse",
  hint,
  accept,
  allowedMimeTypes,
  allowedExtensions,
  maxFileBytes = DEFAULT_MAX_FILE_BYTES,
  maxFiles = 10,
  multiple = true,
  files,
  onFilesChange,
  onFilesSelected,
  disabled = false,
  uploading = false,
  compact = false,
  showPreviews = true,
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string>();

  const isDisabled = disabled || uploading;
  const effectiveMaxFiles = multiple ? maxFiles : 1;

  function validateFile(file: File): string | undefined {
    const ext = fileExtension(file.name);
    const hasMimeConstraint = Boolean(allowedMimeTypes && allowedMimeTypes.size > 0);
    const hasExtConstraint = Boolean(allowedExtensions && allowedExtensions.size > 0);

    if (hasMimeConstraint || hasExtConstraint) {
      const mimeOk = hasMimeConstraint && Boolean(file.type) && allowedMimeTypes!.has(file.type);
      const extOk = hasExtConstraint && allowedExtensions!.has(ext);
      if (!mimeOk && !extOk) {
        return `${file.name}: Unsupported file type.`;
      }
    }

    if (file.size <= 0 || file.size > maxFileBytes) {
      return `${file.name}: File size must be between 1 byte and ${formatFileSize(maxFileBytes)}.`;
    }
    return undefined;
  }

  function processIncoming(incoming: FileList | File[] | null) {
    if (!incoming || isDisabled) return;
    const rawList = Array.from(incoming);
    if (rawList.length === 0) return;

    setError(undefined);
    const current = files ? [...files] : [];
    const accepted: File[] = [];

    for (const file of rawList) {
      const validationMessage = validateFile(file);
      if (validationMessage) {
        setError(validationMessage);
        continue;
      }
      if (!multiple) {
        accepted.splice(0, accepted.length, file);
        continue;
      }
      if (current.length + accepted.length >= effectiveMaxFiles) {
        setError(`Maximum ${effectiveMaxFiles} file${effectiveMaxFiles === 1 ? "" : "s"} allowed.`);
        break;
      }
      const duplicate = [...current, ...accepted].some(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified,
      );
      if (!duplicate) {
        accepted.push(file);
      }
    }

    if (accepted.length === 0) return;

    if (onFilesChange) {
      onFilesChange(multiple ? [...current, ...accepted] : accepted);
    }
    if (onFilesSelected) {
      onFilesSelected(accepted);
    }
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      <div
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-disabled={isDisabled}
        onClick={() => {
          if (!isDisabled) inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (!isDisabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (isDisabled) return;
          dragDepthRef.current += 1;
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isDisabled && event.dataTransfer) {
            event.dataTransfer.dropEffect = "copy";
          }
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) {
            setIsDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDepthRef.current = 0;
          setIsDragging(false);
          processIncoming(event.dataTransfer?.files ?? null);
        }}
        className={cn(
          "group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "px-4 py-4" : "px-5 py-6",
          isDisabled
            ? "cursor-not-allowed border-border/60 bg-muted/30 opacity-60"
            : isDragging
              ? "cursor-copy border-primary bg-primary/10"
              : "cursor-pointer border-border bg-muted/20 hover:border-primary/60 hover:bg-muted/35",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={isDisabled}
          className="sr-only"
          onChange={(event) => {
            processIncoming(event.target.files);
            event.target.value = "";
          }}
        />

        <div className="flex flex-col items-center gap-1.5">
          <div
            className={cn(
              "flex items-center justify-center rounded-full border bg-background transition-colors",
              compact ? "size-8" : "size-10",
              isDragging ? "border-primary text-primary" : "text-muted-foreground group-hover:text-primary",
            )}
          >
            {uploading ? (
              <Loader2 className={cn(compact ? "size-4" : "size-5", "animate-spin text-primary")} />
            ) : (
              <UploadCloud className={compact ? "size-4" : "size-5"} />
            )}
          </div>

          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-foreground">
              {uploading ? "Uploading files…" : isDragging ? "Drop files to attach" : label}
            </p>
            {hint && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">{hint}</p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {showPreviews && files && files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {files.length} file{files.length === 1 ? "" : "s"} ready
            </span>
            {onFilesChange && files.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => {
                  setError(undefined);
                  onFilesChange([]);
                }}
              >
                Clear all
              </Button>
            )}
          </div>
          <div className={cn("grid gap-2", multiple ? "sm:grid-cols-2" : "grid-cols-1")}>
            {files.map((file, idx) => (
              <div
                key={`${file.name}-${file.size}-${idx}`}
                className="flex flex-col justify-between gap-2 rounded-lg border bg-card p-2 text-xs"
              >
                {isImageFile(file.type, file.name) && (
                  <LocalImageThumb file={file} className="h-24 w-full rounded border object-cover" />
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {!isImageFile(file.type, file.name) && fileIconFor(file)}
                    <span className="truncate font-medium text-foreground">{file.name}</span>
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                      {formatFileSize(file.size)}
                    </Badge>
                  </div>
                  {onFilesChange && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="size-7 shrink-0"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => onFilesChange(files.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
