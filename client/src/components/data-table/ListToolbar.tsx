import { Filter, Search, X } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export type ActiveFilterChip = {
  key: string;
  label: string;
  onRemove: () => void;
};

export function ListToolbar({
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  searchInputRef,
  children,
  quickFilters,
  activeChips,
  activeFilters = 0,
  onClear,
}: {
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  children?: ReactNode;
  quickFilters?: ReactNode;
  activeChips?: ActiveFilterChip[];
  activeFilters?: number;
  onClear?: () => void;
}) {
  return (
    <div className="space-y-2.5 rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap gap-2">
        <form
          className="relative min-w-56 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(
              String(new FormData(event.currentTarget).get('search') ?? '').trim(),
            );
          }}
        >
          <Search
            className="pointer-events-none absolute left-3 top-3 text-muted-foreground"
            size={18}
          />
          <Input
            ref={searchInputRef}
            className="h-11 pl-10 pr-9"
            defaultValue={search}
            key={search}
            name="search"
            placeholder={searchPlaceholder}
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearch('')}
              className="absolute right-2.5 top-3 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
          <button className="sr-only" type="submit">
            Search
          </button>
        </form>

        {children && (
          <Sheet>
            <SheetTrigger asChild>
              <Button className="h-11" variant="outline">
                <Filter className="mr-1.5 h-4 w-4" />
                Filters
                {activeFilters > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground font-semibold">
                    {activeFilters}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-full sm:max-w-lg h-full flex flex-col p-0 gap-0 border-l bg-background shadow-2xl"
            >
              <SheetHeader className="p-6 border-b shrink-0 pr-14 space-y-1 bg-card">
                <SheetTitle className="text-base font-semibold">Filter this view</SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Filters apply immediately to the full server-side result set.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">{children}</div>

              <SheetFooter className="p-4 border-t bg-card shrink-0 flex flex-row items-center justify-between gap-2">
                {onClear ? (
                  <Button
                    onClick={onClear}
                    variant="outline"
                    size="sm"
                    disabled={activeFilters === 0}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Clear all filters
                  </Button>
                ) : (
                  <span />
                )}
                <SheetClose asChild>
                  <Button size="sm">Done</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {quickFilters && <div className="pt-0.5">{quickFilters}</div>}

      {activeChips && activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">Active:</span>
          {activeChips.map((chip) => (
            <Badge
              key={chip.key}
              variant="secondary"
              className="gap-1 pl-2 pr-1 py-0.5 text-[11px] font-normal"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                aria-label={`Remove ${chip.label}`}
                onClick={chip.onRemove}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {onClear && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground"
              onClick={onClear}
            >
              Reset all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
