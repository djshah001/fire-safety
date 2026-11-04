import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CheckCircle2,
  Edit,
  FileCheck,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  approveVendor,
  archiveVendor,
  createVendorPriceListItem,
  deleteVendorDocument,
  deleteVendorPriceListItem,
  masterLookupsQuery,
  uploadVendorDocument,
  vendorDetailQuery,
  type Vendor,
} from '@/api/masters';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function VendorDetailSheet({
  vendorId,
  open,
  onOpenChange,
  onEdit,
}: {
  vendorId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (vendor: Vendor) => void;
}) {
  const queryClient = useQueryClient();
  const { data: vendor, isLoading } = useQuery(vendorDetailQuery(vendorId ?? undefined));

  const [activeTab, setActiveTab] = useState<'overview' | 'bank' | 'pricelist' | 'documents'>('overview');
  const [addPriceDialogOpen, setAddPriceDialogOpen] = useState(false);
  const [uploadDocDialogOpen, setUploadDocDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');

  // Price List item form state
  const [selectedItemId, setSelectedItemId] = useState('');
  const [priceItemName, setPriceItemName] = useState('');
  const [priceItemCode, setPriceItemCode] = useState('');
  const [priceItemRate, setPriceItemRate] = useState('');
  const [priceItemLeadDays, setPriceItemLeadDays] = useState('');
  const [priceItemMoq, setPriceItemMoq] = useState('1');

  // Query all catalogue items in database for linking
  const itemsLookups = useQuery({
    ...masterLookupsQuery('items'),
    enabled: addPriceDialogOpen,
  });

  const handleItemSelect = (itemId: string) => {
    setSelectedItemId(itemId);
    if (itemId === 'custom') {
      return;
    }
    const item = itemsLookups.data?.items.find((i) => i.id === itemId);
    if (item && 'name' in item) {
      setPriceItemName(item.name);
      setPriceItemCode(item.code);
    }
  };

  // Document upload state
  const [docType, setDocType] = useState('gst_certificate');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const approveMutation = useMutation({
    mutationFn: () => approveVendor(vendor!.id, vendor!.rowVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'vendors'] });
      toast.success(`Vendor ${vendor?.displayName} approved successfully.`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to approve vendor.');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveVendor(vendor!.id, vendor!.rowVersion, archiveReason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'vendors'] });
      toast.success(`Vendor ${vendor?.displayName} has been archived.`);
      setArchiveDialogOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to archive vendor.');
    },
  });

  const addPriceMutation = useMutation({
    mutationFn: () =>
      createVendorPriceListItem(vendor!.id, {
        itemId: selectedItemId && selectedItemId !== 'custom' ? selectedItemId : undefined,
        vendorProductName: priceItemName.trim(),
        vendorProductCode: priceItemCode.trim() || undefined,
        unitRate: priceItemRate.trim(),
        currency: 'INR',
        leadTimeDays: priceItemLeadDays ? Number(priceItemLeadDays) : undefined,
        minimumOrderQuantity: priceItemMoq.trim() || '1',
        effectiveFrom: new Date().toISOString().slice(0, 10),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'vendors', vendor?.id] });
      toast.success('Price list item added.');
      setAddPriceDialogOpen(false);
      setSelectedItemId('');
      setPriceItemName('');
      setPriceItemCode('');
      setPriceItemRate('');
      setPriceItemLeadDays('');
      setPriceItemMoq('1');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to add price list item.');
    },
  });

  const deletePriceMutation = useMutation({
    mutationFn: (priceListId: string) => deleteVendorPriceListItem(vendor!.id, priceListId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'vendors', vendor?.id] });
      toast.success('Price list item deleted.');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to delete price list item.');
    },
  });

  const uploadDocMutation = useMutation({
    mutationFn: () => uploadVendorDocument(vendor!.id, docType, selectedFile!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'vendors', vendor?.id] });
      toast.success('Document uploaded successfully.');
      setUploadDocDialogOpen(false);
      setSelectedFile(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to upload document.');
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => deleteVendorDocument(vendor!.id, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'vendors', vendor?.id] });
      toast.success('Document deleted.');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to delete document.');
    },
  });

  if (!open) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-4xl h-full flex flex-col p-0 gap-0">
          {isLoading || !vendor ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading vendor profile...</div>
          ) : (
            <>
              {/* Header */}
              <SheetHeader className="p-6 border-b shrink-0 pr-14 space-y-3 bg-card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <SheetTitle className="text-xl font-bold">{vendor.displayName}</SheetTitle>
                      <Badge variant="outline" className="font-mono text-xs">
                        {vendor.code}
                      </Badge>
                    </div>
                    {vendor.tradeName ? (
                      <SheetDescription className="text-xs text-muted-foreground mt-0.5">Trade name: {vendor.tradeName}</SheetDescription>
                    ) : (
                      <SheetDescription className="text-xs text-muted-foreground mt-0.5">Comprehensive vendor operational profile</SheetDescription>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {vendor.isArchived ? (
                      <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        Archived
                      </Badge>
                    ) : vendor.approvalStatus === 'pending_approval' ? (
                      <Badge variant="secondary" className="bg-blue-500/15 text-blue-700 dark:text-blue-300">
                        Pending Approval
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        Active
                      </Badge>
                    )}
                    <Badge variant="outline" className="capitalize">
                      {vendor.vendorType.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </div>

                {/* Action Bar */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {vendor.approvalStatus === 'pending_approval' && (
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={approveMutation.isPending}
                      onClick={() => approveMutation.mutate()}
                    >
                      <CheckCircle2 className="mr-1.5 size-3.5" />
                      Approve Vendor
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => onEdit(vendor)}>
                    <Edit className="mr-1.5 size-3.5" />
                    Edit Details
                  </Button>
                  {!vendor.isArchived && (
                    <Button size="sm" variant="outline" onClick={() => setArchiveDialogOpen(true)}>
                      <Archive className="mr-1.5 size-3.5" />
                      Archive
                    </Button>
                  )}
                </div>
              </SheetHeader>

              {/* Sub-nav tabs */}
              <div className="flex items-center gap-2 border-b bg-muted/20 px-6 py-2 text-xs shrink-0">
                {[
                  { id: 'overview', label: 'Overview & Contacts' },
                  { id: 'bank', label: `Bank Accounts (${vendor.bankAccounts?.length || 0})` },
                  { id: 'pricelist', label: `Price List (${vendor.priceList?.length || 0})` },
                  { id: 'documents', label: `Documents (${vendor.documents?.length || 0})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Sheet Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Tab 1: Overview */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Tax & Registration details */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Tax & Compliance
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-sm rounded-lg border p-4 bg-muted/20">
                        <div>
                          <p className="text-xs text-muted-foreground">GST Status</p>
                          <p className="font-medium capitalize">{vendor.gstStatus}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">GSTIN</p>
                          <p className="font-mono font-medium">{vendor.gstin || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Registered Legal Name</p>
                          <p className="font-medium">{vendor.legalName || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">PAN</p>
                          <p className="font-mono font-medium">{vendor.pan || '—'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Contacts */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Contacts
                      </h4>
                      <div className="space-y-2">
                        {vendor.contacts && vendor.contacts.length > 0 ? (
                          vendor.contacts.map((c) => (
                            <div key={c.id} className="rounded-lg border p-3 flex items-start justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{c.name}</span>
                                  {c.isPrimary && (
                                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary">
                                      Primary
                                    </Badge>
                                  )}
                                  {c.jobTitle && (
                                    <span className="text-xs text-muted-foreground">({c.jobTitle})</span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                                  {c.phone && (
                                    <span className="flex items-center gap-1">
                                      <Phone className="size-3" /> {c.phone}
                                    </span>
                                  )}
                                  {c.alternatePhone && (
                                    <span className="flex items-center gap-1">
                                      <Phone className="size-3" /> Alt: {c.alternatePhone}
                                    </span>
                                  )}
                                  {c.email && (
                                    <span className="flex items-center gap-1">
                                      <Mail className="size-3" /> {c.email}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : vendor.primaryContact ? (
                          <div className="rounded-lg border p-3">
                            <span className="font-medium text-sm">{vendor.primaryContact.name}</span>
                            <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                              {vendor.primaryContact.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="size-3" /> {vendor.primaryContact.phone}
                                </span>
                              )}
                              {vendor.primaryContact.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="size-3" /> {vendor.primaryContact.email}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No contacts recorded.</p>
                        )}
                      </div>
                    </div>

                    {/* Addresses */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Addresses
                      </h4>
                      <div className="space-y-2">
                        {vendor.addresses && vendor.addresses.length > 0 ? (
                          vendor.addresses.map((a) => (
                            <div key={a.id} className="rounded-lg border p-3 flex items-start gap-3">
                              <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                              <div className="text-xs space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold capitalize">{a.addressType} Address</span>
                                  {a.isDefault && (
                                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary">
                                      Default
                                    </Badge>
                                  )}
                                </div>
                                <p>
                                  {a.addressLine1}
                                  {a.addressLine2 ? `, ${a.addressLine2}` : ''}
                                </p>
                                <p className="text-muted-foreground">
                                  {a.city}, {a.state} - {a.postalCode}, {a.country}
                                </p>
                              </div>
                            </div>
                          ))
                        ) : vendor.addressLine1 ? (
                          <div className="rounded-lg border p-3 flex items-start gap-3">
                            <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                            <div className="text-xs space-y-0.5">
                              <p>
                                {vendor.addressLine1}
                                {vendor.addressLine2 ? `, ${vendor.addressLine2}` : ''}
                              </p>
                              <p className="text-muted-foreground">
                                {vendor.city}, {vendor.state} - {vendor.postalCode}, {vendor.country}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No address recorded.</p>
                        )}
                      </div>
                    </div>

                    {/* Commercial & Supply Scope */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Commercial Terms & Scope
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-xs rounded-lg border p-4 bg-muted/20">
                        <div>
                          <p className="text-muted-foreground">Payment Terms</p>
                          <p className="font-medium">{vendor.paymentTerms || 'Standard'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Credit Period</p>
                          <p className="font-medium">{vendor.creditPeriodDays ? `${vendor.creditPeriodDays} days` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Credit Limit</p>
                          <p className="font-medium">{vendor.creditLimit ? `INR ${vendor.creditLimit}` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Typical Lead Time</p>
                          <p className="font-medium">{vendor.typicalLeadTimeDays ? `${vendor.typicalLeadTimeDays} days` : '—'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-muted-foreground">Supplied Brands</p>
                          <p className="font-medium">{vendor.brandsSupplied?.join(', ') || '—'}</p>
                        </div>
                      </div>
                    </div>

                    {vendor.internalNotes && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Internal Notes
                        </h4>
                        <div className="rounded-md border p-3 text-xs bg-muted/30 whitespace-pre-wrap">
                          {vendor.internalNotes}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Bank Accounts */}
                {activeTab === 'bank' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Registered Bank Accounts
                      </h4>
                    </div>

                    {vendor.bankAccounts && vendor.bankAccounts.length > 0 ? (
                      <div className="space-y-3">
                        {vendor.bankAccounts.map((acc) => (
                          <div key={acc.id} className="rounded-lg border p-4 space-y-2 bg-muted/10">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm">{acc.bankName}</span>
                              {acc.isDefault && (
                                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary">
                                  Default Account
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Account Holder: </span>
                                <span className="font-medium">{acc.accountHolderName}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Account Number: </span>
                                <span className="font-mono font-medium">{acc.accountNumberMasked || '••••••••'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">IFSC Code: </span>
                                <span className="font-mono font-medium">{acc.ifscCode}</span>
                              </div>
                              {acc.branch && (
                                <div>
                                  <span className="text-muted-foreground">Branch: </span>
                                  <span>{acc.branch}</span>
                                </div>
                              )}
                              {acc.upiId && (
                                <div>
                                  <span className="text-muted-foreground">UPI ID: </span>
                                  <span className="font-mono">{acc.upiId}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Alert>
                        <AlertDescription className="text-xs">
                          No bank accounts linked yet. Click Edit Details to add banking credentials for this vendor.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* Tab 3: Price List */}
                {activeTab === 'pricelist' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Vendor Price List
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Specific SKU rates and lead times agreed with this supplier.
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setAddPriceDialogOpen(true)}>
                        <Plus className="mr-1.5 size-3.5" />
                        Add Price Item
                      </Button>
                    </div>

                    {vendor.priceList && vendor.priceList.length > 0 ? (
                      <div className="rounded-md border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Product / SKU</TableHead>
                              <TableHead className="text-xs text-right">Unit Rate</TableHead>
                              <TableHead className="text-xs text-center">Lead Time</TableHead>
                              <TableHead className="text-xs text-center">MOQ</TableHead>
                              <TableHead className="text-xs w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {vendor.priceList.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="text-xs">
                                  <p className="font-medium">{item.vendorProductName}</p>
                                  {item.vendorProductCode && (
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                      Code: {item.vendorProductCode}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs font-mono font-medium text-right">
                                  {item.currency} {Number(item.unitRate).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-xs text-center text-muted-foreground">
                                  {item.leadTimeDays ? `${item.leadTimeDays}d` : '—'}
                                </TableCell>
                                <TableCell className="text-xs text-center text-muted-foreground">
                                  {Number(item.minimumOrderQuantity)}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-destructive hover:bg-destructive/10"
                                    onClick={() => deletePriceMutation.mutate(item.id)}
                                    title="Delete"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="rounded-lg border p-6 text-center text-xs text-muted-foreground">
                        No agreed price list items recorded yet. Click &quot;Add Price Item&quot; to register vendor SKUs.
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 4: Documents */}
                {activeTab === 'documents' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Compliance & Catalogue Documents
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          GST Certificate, PAN Copy, Cancelled Cheque, and Product Catalogues.
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setUploadDocDialogOpen(true)}>
                        <Upload className="mr-1.5 size-3.5" />
                        Upload Document
                      </Button>
                    </div>

                    {vendor.documents && vendor.documents.length > 0 ? (
                      <div className="space-y-2">
                        {vendor.documents.map((doc) => (
                          <div key={doc.id} className="rounded-lg border p-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <FileCheck className="size-5 text-emerald-600" />
                              <div className="text-xs">
                                <p className="font-medium">{doc.originalFileName}</p>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <span className="capitalize">{doc.documentType.replace(/_/g, ' ')}</span>
                                  <span>•</span>
                                  <span>{(doc.fileSize / 1024).toFixed(0)} KB</span>
                                  <span>•</span>
                                  <span>{new Date(doc.uploadedAt).toLocaleDateString('en-IN')}</span>
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-destructive hover:bg-destructive/10"
                              onClick={() => deleteDocMutation.mutate(doc.id)}
                              title="Delete document"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border p-6 text-center text-xs text-muted-foreground">
                        No documents uploaded yet. Upload compliance certificates and cheques for procurement approval.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Pinned Footer */}
              <SheetFooter className="px-6 py-3 border-t bg-card shrink-0 flex flex-row items-center justify-between sm:justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  <span>
                    Vendor Code: <strong className="font-mono text-foreground">{vendor.code}</strong> • {vendor.vendorType.replace(/_/g, ' ')}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Add Price Item Dialog */}
      <Dialog open={addPriceDialogOpen} onOpenChange={setAddPriceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Agreed Vendor Price</DialogTitle>
            <DialogDescription>
              Register vendor-specific product codes, negotiated rates, and delivery lead times.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="catalogItemSelect">Link Catalogue Item (All items in database)</Label>
              <Select value={selectedItemId} onValueChange={handleItemSelect}>
                <SelectTrigger id="catalogItemSelect">
                  <SelectValue placeholder="Choose an item from database or enter custom below" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="custom">-- Custom Product (Not in Catalogue) --</SelectItem>
                  {itemsLookups.data?.items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.code} · {'name' in item ? item.name : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="priceItemName">Product Name *</Label>
              <Input
                id="priceItemName"
                placeholder="e.g. 100mm Butterfly Valve PN16"
                value={priceItemName}
                onChange={(e) => setPriceItemName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="priceItemCode">Vendor SKU / Product Code</Label>
              <Input
                id="priceItemCode"
                placeholder="e.g. BV-100-PN16"
                value={priceItemCode}
                onChange={(e) => setPriceItemCode(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="priceItemRate">Unit Rate (INR) *</Label>
                <Input
                  id="priceItemRate"
                  type="number"
                  step="0.0001"
                  placeholder="2450.00"
                  value={priceItemRate}
                  onChange={(e) => setPriceItemRate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="priceItemLeadDays">Lead Time (Days)</Label>
                <Input
                  id="priceItemLeadDays"
                  type="number"
                  placeholder="7"
                  value={priceItemLeadDays}
                  onChange={(e) => setPriceItemLeadDays(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="priceItemMoq">Minimum Order Quantity (MOQ)</Label>
              <Input
                id="priceItemMoq"
                type="number"
                placeholder="1"
                value={priceItemMoq}
                onChange={(e) => setPriceItemMoq(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPriceDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={addPriceMutation.isPending || !priceItemName.trim() || !priceItemRate.trim()}
              onClick={() => addPriceMutation.mutate()}
            >
              {addPriceMutation.isPending ? 'Adding...' : 'Save Price Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={uploadDocDialogOpen} onOpenChange={setUploadDocDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Vendor Document</DialogTitle>
            <DialogDescription>
              Select the document type and attach PDF, PNG, or JPEG files up to 20MB.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="docType">Document Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger id="docType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gst_certificate">GST Registration Certificate</SelectItem>
                  <SelectItem value="pan_copy">PAN Card Copy</SelectItem>
                  <SelectItem value="cancelled_cheque">Cancelled Cheque / Bank Proof</SelectItem>
                  <SelectItem value="catalogue">Product Catalogue / Brochure</SelectItem>
                  <SelectItem value="certifications">ISO / UL / FM / CE Certifications</SelectItem>
                  <SelectItem value="other">Other Supporting Document</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fileInput">Choose File *</Label>
              <Input
                id="fileInput"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setSelectedFile(file);
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDocDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={uploadDocMutation.isPending || !selectedFile}
              onClick={() => uploadDocMutation.mutate()}
            >
              {uploadDocMutation.isPending ? 'Uploading...' : 'Upload File'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Vendor Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Archive className="size-5" />
              Archive Vendor
            </DialogTitle>
            <DialogDescription>
              Archiving vendor <strong>{vendor?.displayName}</strong> will remove them from active selection while preserving all historical POs, RFQs, receipts, and pricing records.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="archiveReason">Reason for archiving (Optional)</Label>
            <Input
              id="archiveReason"
              placeholder="e.g. Discontinued operations, merged entity"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={archiveMutation.isPending}
              onClick={() => archiveMutation.mutate()}
            >
              {archiveMutation.isPending ? 'Archiving...' : 'Confirm Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
