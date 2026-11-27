import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { boqCatalogQuery, type BoqCatalogItem } from "@/api/engineering";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function BoqAddItemDialog({
  open,
  jobId,
  existingSections,
  busy,
  error,
  onClose,
  onAdd,
}: {
  open: boolean;
  jobId: string;
  existingSections: string[];
  busy: boolean;
  error?: string;
  onClose: () => void;
  onAdd: (input: { itemId: string; section?: string; quantity?: string }) => void;
}) {
  const catalog = useQuery({ ...boqCatalogQuery(jobId), enabled: open && Boolean(jobId) });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BoqCatalogItem | null>(null);
  const [section, setSection] = useState("");
  const [quantity, setQuantity] = useState("0");

  const resetAndClose = () => {
    setSelectedItem(null);
    setSection("");
    setQuantity("0");
    setPickerOpen(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetAndClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedItem) return;
            onAdd({
              itemId: selectedItem.id,
              section: section.trim() || selectedItem.categoryName,
              quantity: quantity.trim() || "0",
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Add Catalogue Item to BOQ</DialogTitle>
            <DialogDescription>
              Search active master items by code, name, category, or family and
              assign a BOQ section.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Catalogue Item</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={pickerOpen}
                    className="w-full justify-between font-normal text-sm h-9"
                  >
                    {selectedItem ? (
                      <span className="truncate">
                        <span className="font-mono text-xs text-muted-foreground mr-2">
                          {selectedItem.code}
                        </span>
                        {selectedItem.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Search item by code, name, or category…
                      </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[460px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search item code, name, family…" />
                    <CommandList>
                      <CommandEmpty>
                        {catalog.isPending
                          ? "Loading catalogue items…"
                          : "No matching active items found."}
                      </CommandEmpty>
                      <CommandGroup>
                        {(catalog.data ?? []).map((item) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.code} ${item.name} ${item.categoryName} ${item.familyName ?? ""}`}
                            onSelect={() => {
                              setSelectedItem(item);
                              if (!section) setSection(item.categoryName);
                              setPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4 shrink-0",
                                selectedItem?.id === item.id
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs text-muted-foreground">
                                  {item.code}
                                </span>
                                <span className="text-sm font-medium truncate">
                                  {item.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span>{item.categoryName}</span>
                                {item.familyName && (
                                  <>
                                    <span>·</span>
                                    <span>{item.familyName}</span>
                                  </>
                                )}
                                <span>·</span>
                                <span className="font-mono">{item.unitSymbol}</span>
                                {!item.allowFractional && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] h-4 px-1"
                                  >
                                    Whole
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="add-boq-section" className="text-xs font-semibold">
                  Section / Group
                </Label>
                <Input
                  id="add-boq-section"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  placeholder={selectedItem?.categoryName || "e.g. Pump house"}
                  list="boq-existing-sections"
                  className="h-9 text-sm"
                />
                <datalist id="boq-existing-sections">
                  {existingSections.map((sec) => (
                    <option key={sec} value={sec} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-boq-qty" className="text-xs font-semibold">
                  Initial Quantity{" "}
                  {selectedItem ? `(${selectedItem.unitSymbol})` : ""}
                </Label>
                <Input
                  id="add-boq-qty"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className="h-9 text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={resetAndClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !selectedItem}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add to BOQ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
