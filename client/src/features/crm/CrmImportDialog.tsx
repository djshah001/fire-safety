import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Download, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  commitCrmImport,
  downloadImportTemplate,
  stageCrmImport,
  type CrmImportBatch,
  type CrmImportRow,
  type CrmImportType,
} from '@/api/crm';
import { getApiErrorMessage } from '@/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function rowSummary(type: CrmImportType, row: CrmImportRow) {
  if (type === 'customers') {
    return {
      title: row.payload.display_name || 'Unnamed customer',
      detail: [row.payload.contact_name, row.payload.phone || row.payload.email].filter(Boolean).join(' · '),
    };
  }
  return {
    title: row.payload.inquiry_name || 'Unnamed lead',
    detail: [row.payload.contact_name, row.payload.service_category_code].filter(Boolean).join(' · '),
  };
}

function statusVariant(status: CrmImportRow['status']) {
  if (status === 'created') return 'default' as const;
  if (status === 'invalid' || status === 'failed') return 'destructive' as const;
  return 'secondary' as const;
}

export function CrmImportDialog({
  open,
  onOpenChange,
  type,
  onCommitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: CrmImportType;
  onCommitted: () => Promise<void> | void;
}) {
  const [file, setFile] = useState<File>();
  const [batch, setBatch] = useState<CrmImportBatch>();
  const label = type === 'customers' ? 'customers' : 'open leads';
  const template = useMutation({
    mutationFn: () => downloadImportTemplate(type),
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const staging = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Choose an Excel workbook.');
      return stageCrmImport(type, file);
    },
    onSuccess: (result) => {
      setBatch(result);
      toast.success(`Validated ${result.totalRows} row${result.totalRows === 1 ? '' : 's'}.`);
    },
  });
  const commit = useMutation({
    mutationFn: () => {
      if (!batch) throw new Error('Stage a workbook before committing it.');
      return commitCrmImport(batch);
    },
    onSuccess: async (result) => {
      setBatch(result);
      const created = result.rows.filter((row) => row.status === 'created').length;
      toast.success(`Created ${created} ${created === 1 ? type === 'customers' ? 'customer' : 'lead' : label}.`);
      await onCommitted();
    },
  });

  useEffect(() => {
    if (!open) {
      setFile(undefined);
      setBatch(undefined);
      staging.reset();
      commit.reset();
    }
  }, [open]);

  const createdRows = batch?.rows.filter((row) => row.status === 'created').length ?? 0;
  const failedRows = batch?.rows.filter((row) => row.status === 'failed').length ?? 0;
  const canCommit = Boolean(batch && batch.status !== 'completed' && batch.validRows > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet /> Import {label}</DialogTitle>
          <DialogDescription>
            Download the controlled template, upload up to 500 rows, review server validation, then commit valid rows.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 rounded-lg border bg-muted/25 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor={`${type}-import-file`}>Excel workbook</Label>
            <Input
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={staging.isPending || Boolean(batch)}
              id={`${type}-import-file`}
              onChange={(event) => setFile(event.target.files?.[0])}
              type="file"
            />
            <p className="text-xs text-muted-foreground">Only the supplied .xlsx columns are processed. The original file is retained privately for audit.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={template.isPending} onClick={() => template.mutate()} type="button" variant="outline">
              {template.isPending ? <LoaderCircle className="animate-spin" /> : <Download />}
              Template
            </Button>
            <Button disabled={!file || staging.isPending || Boolean(batch)} onClick={() => staging.mutate()} type="button">
              {staging.isPending ? <LoaderCircle className="animate-spin" /> : <Upload />}
              Validate
            </Button>
          </div>
        </div>

        {staging.isError && <Alert variant="destructive"><AlertTitle>Workbook could not be staged</AlertTitle><AlertDescription>{getApiErrorMessage(staging.error)}</AlertDescription></Alert>}

        {batch && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{batch.totalRows} rows</Badge>
              <Badge>{batch.validRows} valid</Badge>
              {batch.invalidRows > 0 && <Badge variant="destructive">{batch.invalidRows} invalid</Badge>}
              {createdRows > 0 && <Badge className="gap-1"><CheckCircle2 />{createdRows} created</Badge>}
              {failedRows > 0 && <Badge variant="destructive">{failedRows} failed</Badge>}
              <span className="ml-auto truncate text-xs text-muted-foreground">{batch.originalName} · <span className="font-mono">{batch.checksumSha256.slice(0, 12)}…</span></span>
            </div>

            {batch.invalidRows > 0 && batch.status !== 'completed' && (
              <Alert>
                <AlertTitle>Invalid rows will not be imported</AlertTitle>
                <AlertDescription>Correct them in Excel and stage a new batch, or commit only the valid rows shown below.</AlertDescription>
              </Alert>
            )}

            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
                  <TableRow><TableHead className="w-16">Row</TableHead><TableHead>Record</TableHead><TableHead>Validation</TableHead><TableHead className="w-24">Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {batch.rows.map((row) => {
                    const summary = rowSummary(type, row);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs tabular-nums">{row.rowNumber}</TableCell>
                        <TableCell><p className="font-medium">{summary.title}</p><p className="text-xs text-muted-foreground">{summary.detail}</p></TableCell>
                        <TableCell className="min-w-64 text-xs">
                          {row.issues.map((issue, index) => <p className="text-destructive" key={`issue-${index}`}>{issue.field ? `${issue.field}: ` : ''}{issue.message}</p>)}
                          {row.warnings.map((warning, index) => <p className="text-amber-600 dark:text-amber-400" key={`warning-${index}`}>{warning.message}</p>)}
                          {row.resultMessage && <p className="text-destructive">{row.resultMessage}</p>}
                          {row.issues.length === 0 && row.warnings.length === 0 && !row.resultMessage && <span className="text-muted-foreground">Ready</span>}
                        </TableCell>
                        <TableCell><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {commit.isError && <Alert variant="destructive"><AlertTitle>Import could not be completed</AlertTitle><AlertDescription>{getApiErrorMessage(commit.error)}</AlertDescription></Alert>}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">{batch?.status === 'completed' ? 'Close' : 'Cancel'}</Button>
          <Button disabled={!canCommit || commit.isPending} onClick={() => commit.mutate()} type="button">
            {commit.isPending && <LoaderCircle className="animate-spin" />}
            {batch?.status === 'completed' ? 'Import completed' : `Commit ${batch?.validRows ?? 0} valid rows`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
