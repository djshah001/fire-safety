import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function isImageFile(mimeType?: string | null, fileName?: string | null) {
  if (mimeType && mimeType.toLowerCase().startsWith("image/")) return true;
  if (!fileName) return false;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName);
}

export function LocalImageThumb({
  file,
  alt,
  className = "h-24 w-full rounded-md border object-cover bg-muted/20",
}: {
  file: File;
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  if (!url) return null;
  return <img src={url} alt={alt ?? file.name} className={className} />;
}

export function UploadedFilePreviewDialog({
  open,
  onOpenChange,
  title,
  description = "Private document preview",
  src,
  mimeType,
  downloadHref,
  onDownload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  src?: string;
  mimeType?: string;
  downloadHref?: string;
  onDownload?: () => void;
}) {
  const isImage = isImageFile(mimeType, title);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm truncate">{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>
        {src && (
          <div className="flex-1 overflow-auto rounded-md border bg-muted/20 min-h-[60vh] flex items-center justify-center p-2">
            {isImage ? (
              <img
                alt={title ?? "Uploaded image"}
                src={src}
                className="max-h-[68vh] max-w-full object-contain rounded"
              />
            ) : (
              <iframe
                title={title ?? "Document preview"}
                src={src}
                className="w-full h-[65vh] border-0"
              />
            )}
          </div>
        )}
        <DialogFooter className="border-t pt-3">
          {onDownload ? (
            <Button type="button" variant="outline" size="sm" onClick={onDownload}>
              <Download className="size-3.5 mr-1.5" />
              Download
            </Button>
          ) : downloadHref ? (
            <Button asChild type="button" variant="outline" size="sm">
              <a href={downloadHref} download={title}>
                <Download className="size-3.5 mr-1.5" />
                Download
              </a>
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
