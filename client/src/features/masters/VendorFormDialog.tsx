import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, Building, CreditCard, FileText, Info, Phone, ShieldAlert, Truck, Upload, User } from 'lucide-react';
import { toast } from 'sonner';
import {
  checkVendorDuplicates,
  createVendor,
  updateVendor,
  uploadVendorDocument,
  type Vendor,
  type VendorType,
} from '@/api/masters';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Textarea } from '@/components/ui/textarea';

const VENDOR_TYPES: Array<{ value: VendorType; label: string }> = [
  { value: 'material_supplier', label: 'Material supplier' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'distributor_dealer', label: 'Distributor / dealer' },
  { value: 'service_provider', label: 'Service provider' },
  { value: 'installation_contractor', label: 'Installation contractor' },
  { value: 'labour_contractor', label: 'Labour contractor' },
  { value: 'transport_logistics', label: 'Transport / logistics provider' },
  { value: 'other', label: 'Other' },
];

export function VendorFormDialog({
  open,
  onOpenChange,
  vendor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor?: Vendor;
}) {
  const queryClient = useQueryClient();
  const isEditing = Boolean(vendor);

  // Section 1: Basic
  const [displayName, setDisplayName] = useState(vendor?.displayName || '');
  const [tradeName, setTradeName] = useState(vendor?.tradeName || '');
  const [vendorType, setVendorType] = useState<VendorType>(vendor?.vendorType || 'material_supplier');
  const [supplierCategories, setSupplierCategories] = useState<string>(
    vendor?.supplierCategories?.join(', ') || 'Fire Fighting Equipment, Pipes & Fittings'
  );
  const [website, setWebsite] = useState(vendor?.website || '');
  const [companyDescription, setCompanyDescription] = useState(vendor?.companyDescription || '');

  // Section 2: Contact
  const [contactName, setContactName] = useState(vendor?.primaryContact?.name || '');
  const [phone, setPhone] = useState(vendor?.primaryContact?.phone || '');
  const [alternatePhone, setAlternatePhone] = useState(vendor?.primaryContact?.alternatePhone || '');
  const [email, setEmail] = useState(vendor?.primaryContact?.email || '');
  const [jobTitle, setJobTitle] = useState(vendor?.primaryContact?.jobTitle || '');

  // Section 3: Address
  const [addressLine1, setAddressLine1] = useState(vendor?.addressLine1 || '');
  const [addressLine2, setAddressLine2] = useState(vendor?.addressLine2 || '');
  const [city, setCity] = useState(vendor?.city || '');
  const [state, setState] = useState(vendor?.state || '');
  const [postalCode, setPostalCode] = useState(vendor?.postalCode || '');
  const [country, setCountry] = useState(vendor?.country || 'India');

  // Section 4: Tax
  const [gstStatus, setGstStatus] = useState<'registered' | 'unregistered'>(vendor?.gstStatus || 'unregistered');
  const [gstin, setGstin] = useState(vendor?.gstin || '');
  const [legalName, setLegalName] = useState(vendor?.legalName || '');
  const [pan, setPan] = useState(vendor?.pan || '');

  // Section 5: Supply
  const [brandsSupplied, setBrandsSupplied] = useState(vendor?.brandsSupplied?.join(', ') || '');
  const [deliveryLocations, setDeliveryLocations] = useState(vendor?.deliveryLocations || '');
  const [typicalLeadTimeDays, setTypicalLeadTimeDays] = useState(vendor?.typicalLeadTimeDays ? String(vendor.typicalLeadTimeDays) : '');
  const [minimumOrderValue, setMinimumOrderValue] = useState(vendor?.minimumOrderValue || '');

  // Section 6: Commercial
  const [paymentTerms, setPaymentTerms] = useState(vendor?.paymentTerms || '30 Days Net');
  const [creditPeriodDays, setCreditPeriodDays] = useState(vendor?.creditPeriodDays ? String(vendor.creditPeriodDays) : '30');
  const [creditLimit, setCreditLimit] = useState(vendor?.creditLimit || '');
  const [preferredCurrency, setPreferredCurrency] = useState(vendor?.preferredCurrency || 'INR');

  // Section 7: Bank
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [branch, setBranch] = useState('');
  const [upiId, setUpiId] = useState('');

  // Section 8: Internal
  const [internalNotes, setInternalNotes] = useState(vendor?.internalNotes || '');

  // Section 9: Documents
  const [gstFile, setGstFile] = useState<File | null>(null);
  const [panFile, setPanFile] = useState<File | null>(null);
  const [chequeFile, setChequeFile] = useState<File | null>(null);
  const [catalogueFile, setCatalogueFile] = useState<File | null>(null);
  const [certificationsFile, setCertificationsFile] = useState<File | null>(null);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'basic' | 'contact' | 'address' | 'tax' | 'supply' | 'commercial' | 'bank' | 'internal' | 'documents'>('basic');

  // Duplicate warning state
  const [duplicateWarning, setDuplicateWarning] = useState<{
    hasBlockingDuplicate: boolean;
    hasWarnings: boolean;
    gstinMatch?: { displayName: string; code: string };
    nameMatches: Array<{ displayName: string; code: string }>;
    phoneMatches: Array<{ displayName: string; code: string }>;
  } | null>(null);

  // Auto-extract PAN from GSTIN if 15 chars entered
  const handleGstinChange = (value: string) => {
    const uppercase = value.toUpperCase().trim();
    setGstin(uppercase);
    if (uppercase.length >= 12 && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}/.test(uppercase)) {
      const extractedPan = uppercase.slice(2, 12);
      if (!pan || pan === uppercase.slice(2, 12)) {
        setPan(extractedPan);
      }
    }
  };

  // Synchronize form state whenever dialog opens or editing target vendor changes
  useEffect(() => {
    if (open) {
      if (vendor) {
        setDisplayName(vendor.displayName || '');
        setTradeName(vendor.tradeName || '');
        setVendorType(vendor.vendorType || 'material_supplier');
        setSupplierCategories(vendor.supplierCategories?.length ? vendor.supplierCategories.join(', ') : 'Fire Fighting Equipment, Pipes & Fittings');
        setWebsite(vendor.website || '');
        setCompanyDescription(vendor.companyDescription || '');

        setContactName(vendor.primaryContact?.name || '');
        setPhone(vendor.primaryContact?.phone || '');
        setAlternatePhone(vendor.primaryContact?.alternatePhone || '');
        setEmail(vendor.primaryContact?.email || '');
        setJobTitle(vendor.primaryContact?.jobTitle || '');

        setAddressLine1(vendor.addressLine1 || '');
        setAddressLine2(vendor.addressLine2 || '');
        setCity(vendor.city || '');
        setState(vendor.state || '');
        setPostalCode(vendor.postalCode || '');
        setCountry(vendor.country || 'India');

        setGstStatus(vendor.gstStatus || 'unregistered');
        setGstin(vendor.gstin || '');
        setLegalName(vendor.legalName || '');
        setPan(vendor.pan || '');

        setBrandsSupplied(vendor.brandsSupplied?.join(', ') || '');
        setDeliveryLocations(vendor.deliveryLocations || '');
        setTypicalLeadTimeDays(vendor.typicalLeadTimeDays ? String(vendor.typicalLeadTimeDays) : '');
        setMinimumOrderValue(vendor.minimumOrderValue || '');

        setPaymentTerms(vendor.paymentTerms || '30 Days Net');
        setCreditPeriodDays(vendor.creditPeriodDays ? String(vendor.creditPeriodDays) : '30');
        setCreditLimit(vendor.creditLimit || '');
        setPreferredCurrency(vendor.preferredCurrency || 'INR');

        const defaultBank = vendor.bankAccounts?.[0];
        setAccountHolderName(defaultBank?.accountHolderName || '');
        setAccountNumber('');
        setConfirmAccountNumber('');
        setIfscCode(defaultBank?.ifscCode || '');
        setBankName(defaultBank?.bankName || '');
        setBranch(defaultBank?.branch || '');
        setUpiId(defaultBank?.upiId || '');

        setInternalNotes(vendor.internalNotes || '');
      } else {
        setDisplayName('');
        setTradeName('');
        setVendorType('material_supplier');
        setSupplierCategories('Fire Fighting Equipment, Pipes & Fittings');
        setWebsite('');
        setCompanyDescription('');

        setContactName('');
        setPhone('');
        setAlternatePhone('');
        setEmail('');
        setJobTitle('');

        setAddressLine1('');
        setAddressLine2('');
        setCity('');
        setState('');
        setPostalCode('');
        setCountry('India');

        setGstStatus('unregistered');
        setGstin('');
        setLegalName('');
        setPan('');

        setBrandsSupplied('');
        setDeliveryLocations('');
        setTypicalLeadTimeDays('');
        setMinimumOrderValue('');

        setPaymentTerms('30 Days Net');
        setCreditPeriodDays('30');
        setCreditLimit('');
        setPreferredCurrency('INR');

        setAccountHolderName('');
        setAccountNumber('');
        setConfirmAccountNumber('');
        setIfscCode('');
        setBankName('');
        setBranch('');
        setUpiId('');

        setInternalNotes('');
      }

      setGstFile(null);
      setPanFile(null);
      setChequeFile(null);
      setCatalogueFile(null);
      setCertificationsFile(null);
      setActiveTab('basic');
      setDuplicateWarning(null);
    }
  }, [open, vendor]);

  // Debounced duplicate check
  useEffect(() => {
    if (!displayName && !gstin && !phone) {
      setDuplicateWarning(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await checkVendorDuplicates({
          displayName: displayName.trim() || undefined,
          gstin: gstin.trim() || undefined,
          phone: phone.trim() || undefined,
          excludeVendorId: vendor?.id,
        });
        if (result.hasBlockingDuplicate || result.hasWarnings) {
          setDuplicateWarning(result);
        } else {
          setDuplicateWarning(null);
        }
      } catch {
        // ignore background check failure
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [displayName, gstin, phone, vendor?.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      const categoriesArray = supplierCategories
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const brandsArray = brandsSupplied
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload: Record<string, unknown> = {
        displayName: displayName.trim(),
        tradeName: tradeName.trim() || undefined,
        vendorType,
        supplierCategories: categoriesArray.length > 0 ? categoriesArray : ['General'],
        website: website.trim() || undefined,
        companyDescription: companyDescription.trim() || undefined,

        primaryContact: {
          name: contactName.trim(),
          phone: phone.trim(),
          alternatePhone: alternatePhone.trim() || undefined,
          email: email.trim() || undefined,
          jobTitle: jobTitle.trim() || undefined,
          isPrimary: true,
        },

        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || undefined,
        city: city.trim(),
        state: state.trim(),
        postalCode: postalCode.trim(),
        country: country.trim() || 'India',

        gstStatus,
        gstin: gstStatus === 'registered' ? gstin.trim() : undefined,
        legalName: gstStatus === 'registered' ? legalName.trim() : undefined,
        pan: pan.trim() || undefined,

        brandsSupplied: brandsArray,
        deliveryLocations: deliveryLocations.trim() || undefined,
        typicalLeadTimeDays: typicalLeadTimeDays ? Number(typicalLeadTimeDays) : undefined,
        minimumOrderValue: minimumOrderValue ? minimumOrderValue.trim() : undefined,

        paymentTerms: paymentTerms.trim() || undefined,
        creditPeriodDays: creditPeriodDays ? Number(creditPeriodDays) : undefined,
        creditLimit: creditLimit ? creditLimit.trim() : undefined,
        preferredCurrency: preferredCurrency.trim() || 'INR',

        internalNotes: internalNotes.trim() || undefined,
      };

      if (accountNumber && !accountNumber.includes('•') && ifscCode && bankName) {
        if (confirmAccountNumber && accountNumber !== confirmAccountNumber) {
          throw new Error('Bank account numbers do not match.');
        }
        payload.bankAccounts = [
          {
            accountHolderName: accountHolderName.trim() || displayName.trim(),
            accountNumber: accountNumber.trim(),
            confirmAccountNumber: confirmAccountNumber.trim() || accountNumber.trim(),
            ifscCode: ifscCode.trim().toUpperCase(),
            bankName: bankName.trim(),
            branch: branch.trim() || undefined,
            upiId: upiId.trim() || undefined,
            isDefault: true,
          },
        ];
      }

      let saved: Vendor;
      if (isEditing && vendor) {
        payload.expectedVersion = vendor.rowVersion;
        saved = await updateVendor(vendor.id, payload);
      } else {
        saved = await createVendor(payload);
      }

      // Upload attached files if selected
      try {
        if (gstFile) await uploadVendorDocument(saved.id, 'gst_certificate', gstFile);
        if (panFile) await uploadVendorDocument(saved.id, 'pan_copy', panFile);
        if (chequeFile) await uploadVendorDocument(saved.id, 'cancelled_cheque', chequeFile);
        if (catalogueFile) await uploadVendorDocument(saved.id, 'catalogue', catalogueFile);
        if (certificationsFile) await uploadVendorDocument(saved.id, 'certifications', certificationsFile);
      } catch {
        // Document upload errors don't fail the vendor save
      }

      return saved;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['masters', 'vendors'] });
      toast.success(isEditing ? `Vendor ${saved.code} updated successfully.` : `Vendor ${saved.code} created successfully.`);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save vendor.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] sm:max-w-4xl flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building className="size-5 text-primary" />
              <DialogTitle className="text-xl">
                {isEditing ? `Edit Vendor (${vendor?.code})` : 'Register New Vendor'}
              </DialogTitle>
            </div>
          </div>
          <DialogDescription>
            Complete the vendor registration profile with verification for tax, contact, and banking details.
          </DialogDescription>
        </DialogHeader>

        {/* Section Navigation Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b bg-muted/30 px-6 py-2.5 text-xs">
          {[
            { id: 'basic', label: '1. Basic details', icon: Building },
            { id: 'contact', label: '2. Contact', icon: Phone },
            { id: 'address', label: '3. Address', icon: Truck },
            { id: 'tax', label: '4. Tax & Legal', icon: FileText },
            { id: 'supply', label: '5. Supply scope', icon: Info },
            { id: 'commercial', label: '6. Commercial', icon: CreditCard },
            { id: 'bank', label: '7. Bank details', icon: CreditCard },
            { id: 'internal', label: '8. Internal', icon: User },
            { id: 'documents', label: '9. Documents', icon: Upload },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Form Body Scroll Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {duplicateWarning?.hasBlockingDuplicate && (
            <Alert variant="destructive">
              <ShieldAlert className="size-4" />
              <AlertTitle>Duplicate GSTIN Detected</AlertTitle>
              <AlertDescription>
                Another vendor ({duplicateWarning.gstinMatch?.displayName} - {duplicateWarning.gstinMatch?.code}) already exists with GSTIN <strong>{gstin}</strong>. GSTIN must be unique.
              </AlertDescription>
            </Alert>
          )}

          {duplicateWarning?.hasWarnings && !duplicateWarning.hasBlockingDuplicate && (
            <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="size-4 text-amber-600" />
              <AlertTitle>Potential Matching Vendors Found</AlertTitle>
              <AlertDescription className="text-xs space-y-1 mt-1">
                {duplicateWarning.nameMatches.length > 0 && (
                  <p>
                    Matching company name: {duplicateWarning.nameMatches.map((m) => `${m.displayName} (${m.code})`).join(', ')}
                  </p>
                )}
                {duplicateWarning.phoneMatches.length > 0 && (
                  <p>
                    Matching phone number: {duplicateWarning.phoneMatches.map((m) => `${m.displayName} (${m.code})`).join(', ')}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Tab 1: Basic */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Basic Vendor Information
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="displayName">
                    Vendor / Company Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="displayName"
                    placeholder="e.g. Acme Fire Safety Systems Ltd"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tradeName">Trade Name (Optional)</Label>
                  <Input
                    id="tradeName"
                    placeholder="e.g. Acme Fire"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="vendorType">
                    Vendor Type <span className="text-destructive">*</span>
                  </Label>
                  <Select value={vendorType} onValueChange={(val) => setVendorType(val as VendorType)}>
                    <SelectTrigger id="vendorType">
                      <SelectValue placeholder="Select vendor type" />
                    </SelectTrigger>
                    <SelectContent>
                      {VENDOR_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="supplierCategories">
                    Supplier Categories <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="supplierCategories"
                    placeholder="e.g. Sprinklers, Hydrants, Valves, Alarm Panels"
                    value={supplierCategories}
                    onChange={(e) => setSupplierCategories(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Separate categories with commas.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="website">Website (Optional)</Label>
                  <Input
                    id="website"
                    placeholder="https://www.example.com"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="companyDescription">Company Description (Optional)</Label>
                  <Textarea
                    id="companyDescription"
                    placeholder="Brief description of vendor capabilities, specialization, and product range..."
                    value={companyDescription}
                    onChange={(e) => setCompanyDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Contact */}
          {activeTab === 'contact' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Primary Contact Person
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="contactName">
                    Contact Person Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="contactName"
                    placeholder="e.g. Mukesh Sharma"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">
                    Mobile Number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="phone"
                    placeholder="e.g. +91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="e.g. contact@acmefire.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="jobTitle">Designation / Role</Label>
                  <Input
                    id="jobTitle"
                    placeholder="e.g. Sales Manager / Technical Lead"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="alternatePhone">Alternate Mobile / Landline (Optional)</Label>
                  <Input
                    id="alternatePhone"
                    placeholder="e.g. +91 79 2658 0000"
                    value={alternatePhone}
                    onChange={(e) => setAlternatePhone(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Address */}
          {activeTab === 'address' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Registered / Office Address
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="addressLine1">
                    Address Line 1 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="addressLine1"
                    placeholder="Street address, building number, industrial zone"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="addressLine2">Address Line 2 (Optional)</Label>
                  <Input
                    id="addressLine2"
                    placeholder="Floor, suite, landmark"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="city">
                    City <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="city"
                    placeholder="e.g. Ahmedabad"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="state">
                    State <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="state"
                    placeholder="e.g. Gujarat"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="postalCode">
                    PIN Code <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="postalCode"
                    placeholder="e.g. 380015"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="country">
                    Country <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="country"
                    placeholder="India"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Tax */}
          {activeTab === 'tax' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Tax & Statutory Details
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="gstStatus">
                    GST Registration Status <span className="text-destructive">*</span>
                  </Label>
                  <Select value={gstStatus} onValueChange={(val) => setGstStatus(val as 'registered' | 'unregistered')}>
                    <SelectTrigger id="gstStatus">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="registered">Registered (Regular / Composite)</SelectItem>
                      <SelectItem value="unregistered">Unregistered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {gstStatus === 'registered' && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="gstin">
                        GSTIN <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="gstin"
                        placeholder="e.g. 24ABCDE1234F1Z5"
                        maxLength={15}
                        value={gstin}
                        onChange={(e) => handleGstinChange(e.target.value)}
                        className="font-mono uppercase"
                        required
                      />
                      <p className="text-xs text-muted-foreground">15-character valid GSTIN format.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="legalName">
                        Registered Legal Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="legalName"
                        placeholder="Exact legal name as per GST certificate"
                        value={legalName}
                        onChange={(e) => setLegalName(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="pan">PAN (Permanent Account Number)</Label>
                  <Input
                    id="pan"
                    placeholder="e.g. ABCDE1234F"
                    maxLength={10}
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase().trim())}
                    className="font-mono uppercase"
                  />
                  <p className="text-xs text-muted-foreground">10-character standard PAN.</p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: Supply */}
          {activeTab === 'supply' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Supply Capabilities & Lead Times
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="brandsSupplied">Brands / Makes Supplied</Label>
                  <Input
                    id="brandsSupplied"
                    placeholder="e.g. Tyco, Honeywell, Newage, Tata, Jindal"
                    value={brandsSupplied}
                    onChange={(e) => setBrandsSupplied(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Comma-separated manufacturer brands.</p>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="deliveryLocations">Delivery Locations / Coverage</Label>
                  <Input
                    id="deliveryLocations"
                    placeholder="e.g. All Gujarat, Pan-India, Western Region"
                    value={deliveryLocations}
                    onChange={(e) => setDeliveryLocations(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="typicalLeadTimeDays">Typical Lead Time (Days)</Label>
                  <Input
                    id="typicalLeadTimeDays"
                    type="number"
                    min={0}
                    max={365}
                    placeholder="e.g. 7"
                    value={typicalLeadTimeDays}
                    onChange={(e) => setTypicalLeadTimeDays(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="minimumOrderValue">Minimum Order Value (INR)</Label>
                  <Input
                    id="minimumOrderValue"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="e.g. 10000.00"
                    value={minimumOrderValue}
                    onChange={(e) => setMinimumOrderValue(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 6: Commercial */}
          {activeTab === 'commercial' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Commercial & Credit Terms
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="paymentTerms">Payment Terms</Label>
                  <Input
                    id="paymentTerms"
                    placeholder="e.g. 30 Days Net / 50% Advance"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="creditPeriodDays">Credit Period (Days)</Label>
                  <Input
                    id="creditPeriodDays"
                    type="number"
                    min={0}
                    max={365}
                    placeholder="e.g. 30"
                    value={creditPeriodDays}
                    onChange={(e) => setCreditPeriodDays(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="creditLimit">Credit Limit (INR)</Label>
                  <Input
                    id="creditLimit"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="e.g. 500000.00"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="preferredCurrency">Preferred Currency</Label>
                  <Input
                    id="preferredCurrency"
                    maxLength={3}
                    placeholder="INR"
                    value={preferredCurrency}
                    onChange={(e) => setPreferredCurrency(e.target.value.toUpperCase())}
                    className="font-mono uppercase"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 7: Bank */}
          {activeTab === 'bank' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Bank Account Details (for Payments)
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Bank account details can be entered now or updated prior to purchase order settlement.
              </p>

              {vendor?.bankAccounts && vendor.bankAccounts.length > 0 && vendor.bankAccounts[0] && (
                <Alert className="bg-muted/40 border-muted">
                  <CreditCard className="size-4 text-primary" />
                  <AlertTitle className="text-xs font-semibold">Active Bank Account on File</AlertTitle>
                  <AlertDescription className="text-xs text-muted-foreground mt-0.5">
                    {vendor.bankAccounts[0].bankName} · {vendor.bankAccounts[0].accountNumberMasked || '••••••••'} (IFSC: {vendor.bankAccounts[0].ifscCode}). Leave account number empty to keep these details unchanged, or enter a new account number to replace it.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="accountHolderName">Account Holder Name</Label>
                  <Input
                    id="accountHolderName"
                    placeholder="e.g. Acme Fire Safety Systems Ltd"
                    value={accountHolderName}
                    onChange={(e) => setAccountHolderName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input
                    id="accountNumber"
                    type="password"
                    placeholder="Enter account number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmAccountNumber">Confirm Account Number</Label>
                  <Input
                    id="confirmAccountNumber"
                    placeholder="Re-enter account number"
                    value={confirmAccountNumber}
                    onChange={(e) => setConfirmAccountNumber(e.target.value)}
                  />
                  {accountNumber && confirmAccountNumber && accountNumber !== confirmAccountNumber && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="size-3" /> Account numbers do not match.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ifscCode">IFSC Code</Label>
                  <Input
                    id="ifscCode"
                    maxLength={11}
                    placeholder="e.g. SBIN0001234"
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value.toUpperCase().trim())}
                    className="font-mono uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input
                    id="bankName"
                    placeholder="e.g. State Bank of India"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    placeholder="e.g. Ashram Road, Ahmedabad"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="upiId">UPI ID (Optional)</Label>
                  <Input
                    id="upiId"
                    placeholder="e.g. acmefire@okaxis"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 8: Internal */}
          {activeTab === 'internal' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Internal Notes & Employee Management
              </h3>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="internalNotes">Internal Notes (Employee Only)</Label>
                  <Textarea
                    id="internalNotes"
                    placeholder="Confidential notes, supplier reliability assessment, special discount agreements..."
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 9: Documents */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Vendor Document Attachments
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Upload statutory GST certificates, PAN copies, cancelled cheque, catalogues, and certifications (PDF, PNG, JPG up to 20MB).
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="formGstFile">GST Certificate</Label>
                  <Input
                    id="formGstFile"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setGstFile(e.target.files?.[0] || null)}
                  />
                  {gstFile && <p className="text-xs text-emerald-600 font-medium">Selected: {gstFile.name}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="formPanFile">PAN Copy</Label>
                  <Input
                    id="formPanFile"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setPanFile(e.target.files?.[0] || null)}
                  />
                  {panFile && <p className="text-xs text-emerald-600 font-medium">Selected: {panFile.name}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="formChequeFile">Cancelled Cheque / Bank Proof</Label>
                  <Input
                    id="formChequeFile"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setChequeFile(e.target.files?.[0] || null)}
                  />
                  {chequeFile && <p className="text-xs text-emerald-600 font-medium">Selected: {chequeFile.name}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="formCatalogueFile">Product Catalogue / Brochure</Label>
                  <Input
                    id="formCatalogueFile"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setCatalogueFile(e.target.files?.[0] || null)}
                  />
                  {catalogueFile && <p className="text-xs text-emerald-600 font-medium">Selected: {catalogueFile.name}</p>}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="formCertificationsFile">ISO / CE / FM / UL Certifications (Optional)</Label>
                  <Input
                    id="formCertificationsFile"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setCertificationsFile(e.target.files?.[0] || null)}
                  />
                  {certificationsFile && <p className="text-xs text-emerald-600 font-medium">Selected: {certificationsFile.name}</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t bg-muted/20 flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={activeTab === 'basic'}
              onClick={() => {
                const tabs: typeof activeTab[] = ['basic', 'contact', 'address', 'tax', 'supply', 'commercial', 'bank', 'internal', 'documents'];
                const idx = tabs.indexOf(activeTab);
                if (idx > 0) setActiveTab(tabs[idx - 1]!);
              }}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={activeTab === 'documents'}
              onClick={() => {
                const tabs: typeof activeTab[] = ['basic', 'contact', 'address', 'tax', 'supply', 'commercial', 'bank', 'internal', 'documents'];
                const idx = tabs.indexOf(activeTab);
                if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1]!);
              }}
            >
              Next Section
            </Button>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                mutation.isPending ||
                duplicateWarning?.hasBlockingDuplicate ||
                !displayName.trim() ||
                !contactName.trim() ||
                !phone.trim() ||
                !addressLine1.trim() ||
                !city.trim() ||
                !state.trim() ||
                !postalCode.trim() ||
                (gstStatus === 'registered' && (!gstin.trim() || !legalName.trim()))
              }
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Vendor'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

