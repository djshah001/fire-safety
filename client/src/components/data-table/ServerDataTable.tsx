import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export type ServerColumn<T, TSort extends string> = {
  key: string;
  label: string;
  sort?: TSort;
  className?: string;
  cell: (row: T) => ReactNode;
};

type RowSelection<T> = {
  selectedKeys: ReadonlySet<string>;
  onToggle: (row: T, selected: boolean) => void;
  onToggleAll: (rows: T[], selected: boolean) => void;
  rowLabel: (row: T) => string;
};

export function ServerDataTable<T, TSort extends string>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  sort,
  direction,
  onSort,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  selection,
}: {
  columns: Array<ServerColumn<T, TSort>>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty: ReactNode;
  sort: TSort;
  direction: 'asc' | 'desc';
  onSort: (sort: TSort, direction: 'asc' | 'desc') => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRowClick?: (row: T) => void;
  selection?: RowSelection<T>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const selectedOnPage = rows.filter((row) => selection?.selectedKeys.has(rowKey(row))).length;
  const allOnPageSelected = rows.length > 0 && selectedOnPage === rows.length;
  const someOnPageSelected = selectedOnPage > 0 && !allOnPageSelected;
  const columnCount = columns.length + (selection ? 1 : 0);

  return (
    <div>
      <div className="max-h-[36rem] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
            <TableRow>
              {selection && (
                <TableHead className="w-11 px-3">
                  <Checkbox
                    aria-label="Select all rows on this page"
                    checked={allOnPageSelected || (someOnPageSelected ? 'indeterminate' : false)}
                    disabled={loading || rows.length === 0}
                    onCheckedChange={(checked) => selection.onToggleAll(rows, checked === true)}
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead className={column.className} key={column.key}>
                  {column.sort ? (
                    <Button
                      className="-ml-3 h-8"
                      onClick={() => onSort(
                        column.sort!,
                        sort === column.sort && direction === 'asc' ? 'desc' : 'asc',
                      )}
                      size="sm"
                      variant="ghost"
                    >
                      {column.label}
                      {sort !== column.sort ? <ArrowUpDown /> : direction === 'asc' ? <ArrowUp /> : <ArrowDown />}
                    </Button>
                  ) : column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 5 }, (_, index) => (
              <TableRow key={index}>
                {selection && <TableCell className="px-3"><Skeleton className="size-4" /></TableCell>}
                {columns.map((column) => <TableCell key={column.key}><Skeleton className="h-6 w-full" /></TableCell>)}
              </TableRow>
            )) : rows.length === 0 ? (
              <TableRow>
                <TableCell className="h-40 text-center text-muted-foreground" colSpan={columnCount}>{empty}</TableCell>
              </TableRow>
            ) : rows.map((row) => {
              const key = rowKey(row);
              const selected = selection?.selectedKeys.has(key) ?? false;
              return (
                <TableRow
                  className={onRowClick ? 'cursor-pointer' : undefined}
                  data-state={selected ? 'selected' : undefined}
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (onRowClick && (event.key === 'Enter' || event.key === ' ')) onRowClick(row);
                  }}
                >
                  {selection && (
                    <TableCell className="w-11 px-3" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${selection.rowLabel(row)}`}
                        checked={selected}
                        onCheckedChange={(checked) => selection.onToggle(row, checked === true)}
                      />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell className={column.className} key={column.key}>{column.cell(row)}</TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
        <span className="tabular-nums">{first}–{last} of {total}</span>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">Rows</span>
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
            <SelectTrigger className="h-8 w-20" aria-label="Rows per page"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100, 200, 500].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)} size="icon-sm" variant="outline"><ChevronLeft /></Button>
          <span className="min-w-16 text-center tabular-nums">{page} / {pages}</span>
          <Button aria-label="Next page" disabled={page >= pages} onClick={() => onPageChange(page + 1)} size="icon-sm" variant="outline"><ChevronRight /></Button>
        </div>
      </div>
    </div>
  );
}
