import { Filter, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

export function ListToolbar({ search, onSearch, children, activeFilters = 0, onClear }: {
  search: string;
  onSearch: (value: string) => void;
  children?: ReactNode;
  activeFilters?: number;
  onClear?: () => void;
}) {
  return <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-3 shadow-sm"><form className="relative min-w-56 flex-1" onSubmit={(event) => { event.preventDefault(); onSearch(String(new FormData(event.currentTarget).get('search') ?? '').trim()); }}><Search className="pointer-events-none absolute left-3 top-3 text-muted-foreground" size={18} /><Input className="h-11 pl-10" defaultValue={search} key={search} name="search" placeholder="Search…" /><button className="sr-only" type="submit">Search</button></form>{children && <Sheet><SheetTrigger asChild><Button className="h-11" variant="outline"><Filter />Filters{activeFilters > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeFilters}</span>}</Button></SheetTrigger><SheetContent><SheetHeader><SheetTitle>Filter this view</SheetTitle><SheetDescription>Filters apply to the full server-side result set.</SheetDescription></SheetHeader><div className="space-y-5 px-4">{children}</div>{onClear && <SheetFooter><Button onClick={onClear} variant="outline"><X />Clear filters</Button></SheetFooter>}</SheetContent></Sheet>}</div>;
}
