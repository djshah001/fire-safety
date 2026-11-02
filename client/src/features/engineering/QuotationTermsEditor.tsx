import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Clause = { id: string; text: string };

export function QuotationTermsEditor({ name, defaultValue, maxLength = 4000 }: { name: string; defaultValue: string; maxLength?: number }) {
  const [clauses, setClauses] = useState<Clause[]>(() => (defaultValue.split(/\n(?=\s*\d+[.:]\s)/).filter(Boolean).map((text, index) => ({ id: `clause-${index}`, text }))));
  const [activeId, setActiveId] = useState<string>();
  const serialized = clauses.map((clause) => clause.text).filter((value) => value.trim()).join('\n');
  const change = (id: string, text: string) => setClauses((current) => current.map((clause) => clause.id === id ? { ...clause, text } : clause));
  const add = () => { const id = crypto.randomUUID(); setClauses((current) => [...current, { id, text: '' }]); setActiveId(id); };

  return <fieldset className="min-w-0 space-y-3">
    <legend className="sr-only">Terms and conditions / exclusions</legend>
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">Terms and conditions / exclusions</p><p className="mt-1 text-xs text-muted-foreground">Open a clause to edit its wording. Changes apply to this revision.</p></div><Badge variant="secondary">{clauses.length} clauses</Badge></div>
    <input type="hidden" name={name} value={serialized} />
    <div className="space-y-2">{clauses.map((clause, index) => {
      const clean = clause.text.replace(/^\s*\d+[.:]\s*/, '');
      const colon = clean.indexOf(':');
      const title = colon > 0 && colon < 70 ? clean.slice(0, colon) : `Clause ${index + 1}`;
      const summary = colon > 0 && colon < 70 ? clean.slice(colon + 1).trim() : clean;
      const displayNumber = clause.text.match(/^\s*(\d+)[.:]\s*/)?.[1] ?? String(index + 1);
      return <Collapsible key={clause.id} open={activeId === clause.id} onOpenChange={(open) => setActiveId(open ? clause.id : undefined)} className="overflow-hidden rounded-xl border bg-background">
        <div className="flex items-center gap-1 p-1"><CollapsibleTrigger asChild><Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 items-start justify-start gap-3 rounded-lg px-3 py-3 text-left whitespace-normal">
          <Badge variant="outline" className="mt-0.5 shrink-0 tabular-nums">{displayNumber}</Badge><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span><span className="mt-1 line-clamp-1 text-xs font-normal text-muted-foreground">{summary || 'Add the wording for this clause'}</span></span><ChevronDown className={`mt-0.5 size-4 shrink-0 transition-transform ${activeId === clause.id ? 'rotate-180' : ''}`} />
        </Button></CollapsibleTrigger><Button type="button" variant="ghost" size="icon-sm" disabled={clauses.length === 1} aria-label={`Remove clause ${index + 1}`} className="mr-2 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setClauses((current) => current.filter((entry) => entry.id !== clause.id))}><Trash2 /></Button></div>
        <CollapsibleContent className="border-t bg-muted/20 p-4"><Label className="sr-only" htmlFor={clause.id}>{`Clause ${index + 1} wording`}</Label><Textarea id={clause.id} value={clause.text} onChange={(event) => change(clause.id, event.target.value)} rows={4} maxLength={Math.max(0, maxLength - (serialized.length - clause.text.length) - 1)} className="field-sizing-fixed max-h-48 min-h-28 resize-y overflow-y-auto text-sm leading-relaxed" placeholder="Clause title: Enter the terms…" /><p className="mt-2 text-xs text-muted-foreground">Include the clause number and title if they should appear in the PDF.</p></CollapsibleContent>
      </Collapsible>;
    })}</div>
    <div className="flex items-center justify-between gap-3"><Button type="button" size="sm" variant="outline" onClick={add} disabled={serialized.length >= maxLength}><Plus />Add clause</Button><span className={`text-xs tabular-nums ${serialized.length > maxLength ? 'text-destructive' : 'text-muted-foreground'}`}>{serialized.length.toLocaleString()} / {maxLength.toLocaleString()} characters</span></div>
  </fieldset>;
}
