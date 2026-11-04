import { Filter, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export function ListToolbar({
  search,
  onSearch,
  children,
  activeFilters = 0,
  onClear,
}: {
  search: string;
  onSearch: (value: string) => void;
  children?: ReactNode;
  activeFilters?: number;
  onClear?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-3 shadow-sm">
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
          className="h-11 pl-10"
          defaultValue={search}
          key={search}
          name="search"
          placeholder="Search…"
        />
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
            className="w-full sm:max-w-md h-full flex flex-col p-0 gap-0 border-l bg-background shadow-2xl"
          >
            <SheetHeader className="p-6 border-b shrink-0 pr-14 space-y-1 bg-card">
              <SheetTitle className="text-base font-semibold">Filter this view</SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Filters apply to the full server-side result set.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">{children}</div>

            {onClear && (
              <SheetFooter className="p-4 border-t bg-card shrink-0 flex flex-row items-center justify-end">
                <Button onClick={onClear} variant="outline" size="sm">
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Clear filters
                </Button>
              </SheetFooter>
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
