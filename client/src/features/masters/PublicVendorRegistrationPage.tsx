import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Building,
  CheckCircle2,
  CreditCard,
  FileText,
  Flame,
  Info,
  Phone,
  Send,
  Truck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  publicOnboardingInvitationQuery,
  submitPublicOnboarding,
  uploadPublicOnboardingDocument,
  type VendorType,
} from "@/api/masters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const VENDOR_TYPES: Array<{ value: VendorType; label: string }> = [
  { value: "material_supplier", label: "Material supplier" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "distributor_dealer", label: "Distributor / dealer" },
  { value: "service_provider", label: "Service provider" },
  { value: "installation_contractor", label: "Installation contractor" },
  { value: "labour_contractor", label: "Labour contractor" },
  { value: "transport_logistics", label: "Transport / logistics provider" },
  { value: "other", label: "Other" },
];

export function PublicVendorRegistrationPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery(
    publicOnboardingInvitationQuery(token),
  );

  // Section 1: Basic
  const [displayName, setDisplayName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [vendorType, setVendorType] = useState<VendorType>("material_supplier");
  const [supplierCategories, setSupplierCategories] = useState(
    "Fire Fighting Equipment, Pipes & Fittings",
  );
  const [website, setWebsite] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");

  // Section 2: Contact
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  // Section 3: Address
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("India");

  // Section 4: Tax
  const [gstStatus, setGstStatus] = useState<"registered" | "unregistered">(
    "unregistered",
  );
  const [gstin, setGstin] = useState("");
  const [legalName, setLegalName] = useState("");
  const [pan, setPan] = useState("");

  // Section 5: Supply
  const [brandsSupplied, setBrandsSupplied] = useState("");
  const [deliveryLocations, setDeliveryLocations] = useState("");
  const [typicalLeadTimeDays, setTypicalLeadTimeDays] = useState("7");
  const [minimumOrderValue, setMinimumOrderValue] = useState("");

  // Section 6: Commercial
  const [paymentTerms, setPaymentTerms] = useState("30 Days Net");
  const [creditPeriodDays, setCreditPeriodDays] = useState("30");
  const [creditLimit, setCreditLimit] = useState("");
  const [preferredCurrency] = useState("INR");

  // Section 7: Bank
  const [accountHolderName, setAccountHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [branch, setBranch] = useState("");
  const [upiId, setUpiId] = useState("");

  // Section 8: Files
  const [gstFile, setGstFile] = useState<File | null>(null);
  const [panFile, setPanFile] = useState<File | null>(null);
  const [chequeFile, setChequeFile] = useState<File | null>(null);
  const [catalogueFile, setCatalogueFile] = useState<File | null>(null);
  const [certificationsFile, setCertificationsFile] = useState<File | null>(null);

  // Success state
  const [submissionSuccess, setSubmissionSuccess] = useState<{
    code: string;
    displayName: string;
  } | null>(null);

  // Initialize from invitation data when loaded
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (data && data.status === "pending" && !initialized) {
      if (data.invitation.contactName) setContactName(data.invitation.contactName);
      if (data.invitation.whatsappNumber) setPhone(data.invitation.whatsappNumber);
      if (data.invitation.companyName) setDisplayName(data.invitation.companyName);
      setInitialized(true);
    }
  }, [data, initialized]);

  const handleGstinChange = (value: string) => {
    const uppercase = value.toUpperCase().trim();
    setGstin(uppercase);
    if (
      uppercase.length >= 12 &&
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}/.test(uppercase)
    ) {
      const extractedPan = uppercase.slice(2, 12);
      if (!pan || pan === uppercase.slice(2, 12)) {
        setPan(extractedPan);
      }
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Missing token");
      const categoriesArray = supplierCategories
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const brandsArray = brandsSupplied
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const payload: Record<string, unknown> = {
        displayName: displayName.trim(),
        tradeName: tradeName.trim() || undefined,
        vendorType,
        supplierCategories:
          categoriesArray.length > 0 ? categoriesArray : ["General"],
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
        country: country.trim() || "India",

        gstStatus,
        gstin: gstStatus === "registered" ? gstin.trim() : undefined,
        legalName: gstStatus === "registered" ? legalName.trim() : undefined,
        pan: pan.trim() || undefined,

        brandsSupplied: brandsArray,
        deliveryLocations: deliveryLocations.trim() || undefined,
        typicalLeadTimeDays: typicalLeadTimeDays
          ? Number(typicalLeadTimeDays)
          : undefined,
        minimumOrderValue: minimumOrderValue
          ? minimumOrderValue.trim()
          : undefined,

        paymentTerms: paymentTerms.trim() || undefined,
        creditPeriodDays: creditPeriodDays
          ? Number(creditPeriodDays)
          : undefined,
        creditLimit: creditLimit ? creditLimit.trim() : undefined,
        preferredCurrency,
      };

      if (accountNumber && ifscCode && bankName) {
        if (confirmAccountNumber && accountNumber !== confirmAccountNumber) {
          throw new Error("Bank account numbers do not match.");
        }
        payload.bankAccounts = [
          {
            accountHolderName: accountHolderName.trim() || displayName.trim(),
            accountNumber: accountNumber.trim(),
            confirmAccountNumber:
              confirmAccountNumber.trim() || accountNumber.trim(),
            ifscCode: ifscCode.trim().toUpperCase(),
            bankName: bankName.trim(),
            branch: branch.trim() || undefined,
            upiId: upiId.trim() || undefined,
            isDefault: true,
          },
        ];
      }

      const res = await submitPublicOnboarding(token, payload);

      // Upload attached files if present
      try {
        if (gstFile)
          await uploadPublicOnboardingDocument(
            token,
            "gst_certificate",
            gstFile,
          );
        if (panFile)
          await uploadPublicOnboardingDocument(token, "pan_copy", panFile);
        if (chequeFile)
          await uploadPublicOnboardingDocument(
            token,
            "cancelled_cheque",
            chequeFile,
          );
        if (catalogueFile)
          await uploadPublicOnboardingDocument(
            token,
            "catalogue",
            catalogueFile,
          );
        if (certificationsFile)
          await uploadPublicOnboardingDocument(
            token,
            "certifications",
            certificationsFile,
          );
      } catch {
        // file upload errors don't fail the registration
      }

      return res;
    },
    onSuccess: (res) => {
      setSubmissionSuccess({ code: res.code, displayName: res.displayName });
      toast.success("Registration submitted successfully!");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : "Registration failed. Check details.",
      );
    },
  });

  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <p className="text-sm text-muted-foreground">
          Verifying registration invitation...
        </p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="max-w-md w-full border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="size-5" />
              Invalid Registration Link
            </CardTitle>
            <CardDescription>
              This registration invitation link is invalid or has expired.
              Please contact the Fire Safety procurement team for a new link.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (data.status === "submitted" || submissionSuccess) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="max-w-lg w-full border-emerald-500/30 text-center">
          <CardHeader className="space-y-3">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <CheckCircle2 className="size-7" />
            </div>
            <CardTitle className="text-2xl font-bold">
              Registration Submitted
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Thank you for registering with <strong>Fire Safety</strong>. Your
              vendor onboarding profile has been submitted and is currently
              under review by our procurement team.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 text-xs space-y-1 text-left">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Company Name:</span>
                <span className="font-semibold">
                  {submissionSuccess?.displayName ||
                    data.invitation.companyName ||
                    "Your Company"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reference Code:</span>
                <span className="font-mono font-semibold">
                  {submissionSuccess?.code || "Pending"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <Badge
                  variant="secondary"
                  className="bg-blue-500/15 text-blue-700 dark:text-blue-300"
                >
                  Under Procurement Review
                </Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              You will be contacted via WhatsApp or email once your registration
              has been approved.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (data.status === "expired") {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <Card className="max-w-md w-full border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-amber-700 flex items-center gap-2">
              <AlertCircle className="size-5" />
              Invitation Expired
            </CardTitle>
            <CardDescription>
              This vendor registration invitation has expired. Please reach out
              to your procurement contact to request a refreshed invitation
              link.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-muted/10 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Banner */}
        <div className="rounded-xl border bg-card p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <Flame className="size-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Fire Safety</h1>
              <p className="text-xs text-muted-foreground">
                Official Vendor Onboarding &amp; Registration Portal
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground sm:text-right">
            <p>
              Invited contact:{" "}
              <strong className="text-foreground">
                {data.invitation.contactName}
              </strong>
            </p>
            <p>WhatsApp: {data.invitation.whatsappNumber}</p>
          </div>
        </div>

        {/* Main Registration Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitMutation.mutate();
          }}
          className="space-y-8"
        >
          {/* Section 1: Basic */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building className="size-4.5 text-primary" />
                1. Basic Details
              </CardTitle>
              <CardDescription className="text-xs">
                Legal identity, vendor classification, and company description.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="displayName">
                  Vendor / Company Name{" "}
                  <span className="text-destructive">*</span>
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
                <Select
                  value={vendorType}
                  onValueChange={(val) => setVendorType(val as VendorType)}
                >
                  <SelectTrigger id="vendorType">
                    <SelectValue />
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
                  Supplier Categories{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="supplierCategories"
                  placeholder="e.g. Sprinklers, Hydrants, Valves, Alarm Panels"
                  value={supplierCategories}
                  onChange={(e) => setSupplierCategories(e.target.value)}
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Separate categories with commas.
                </p>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="website">Website (Optional)</Label>
                <Input
                  id="website"
                  placeholder="https://www.example.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="companyDescription">
                  Company Description (Optional)
                </Label>
                <Textarea
                  id="companyDescription"
                  placeholder="Brief description of your products, manufacturing setup, and experience..."
                  value={companyDescription}
                  onChange={(e) => setCompanyDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Contact */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="size-4.5 text-primary" />
                2. Primary Contact
              </CardTitle>
              <CardDescription className="text-xs">
                Key authorized person for purchasing and order coordination.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="contactName">
                  Contact Person Name{" "}
                  <span className="text-destructive">*</span>
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
                  placeholder="e.g. contact@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="jobTitle">Designation</Label>
                <Input
                  id="jobTitle"
                  placeholder="e.g. Sales Manager"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="alternatePhone">
                  Alternate Number (Optional)
                </Label>
                <Input
                  id="alternatePhone"
                  placeholder="e.g. +91 91234 56789"
                  value={alternatePhone}
                  onChange={(e) => setAlternatePhone(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Address */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="size-4.5 text-primary" />
                3. Address
              </CardTitle>
              <CardDescription className="text-xs">
                Registered office or warehouse dispatch location.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="addressLine1">
                  Address Line 1 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="addressLine1"
                  placeholder="Building, plot number, industrial area"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="addressLine2">Address Line 2 (Optional)</Label>
                <Input
                  id="addressLine2"
                  placeholder="Suite, landmark, street"
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
            </CardContent>
          </Card>

          {/* Section 4: Tax */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="size-4.5 text-primary" />
                4. Tax Details
              </CardTitle>
              <CardDescription className="text-xs">
                GST registration and statutory identification.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="gstStatus">
                  GST Registration Status{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={gstStatus}
                  onValueChange={(val) =>
                    setGstStatus(val as "registered" | "unregistered")
                  }
                >
                  <SelectTrigger id="gstStatus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="registered">
                      Registered (GST Registered)
                    </SelectItem>
                    <SelectItem value="unregistered">Unregistered</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {gstStatus === "registered" && (
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
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="legalName">
                      Registered Legal Name{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="legalName"
                      placeholder="Exact name on GST certificate"
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="pan">PAN</Label>
                <Input
                  id="pan"
                  placeholder="e.g. ABCDE1234F"
                  maxLength={10}
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase().trim())}
                  className="font-mono uppercase"
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 5: Supply */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="size-4.5 text-primary" />
                5. Supply Details
              </CardTitle>
              <CardDescription className="text-xs">
                Brands supplied, delivery locations, and order parameters.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="brandsSupplied">
                  Brands Supplied (Optional)
                </Label>
                <Input
                  id="brandsSupplied"
                  placeholder="e.g. Tyco, Newage, Tata, Jindal"
                  value={brandsSupplied}
                  onChange={(e) => setBrandsSupplied(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="typicalLeadTimeDays">
                  Typical Lead Time (Days)
                </Label>
                <Input
                  id="typicalLeadTimeDays"
                  type="number"
                  placeholder="7"
                  value={typicalLeadTimeDays}
                  onChange={(e) => setTypicalLeadTimeDays(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="minimumOrderValue">
                  Minimum Order Value (INR)
                </Label>
                <Input
                  id="minimumOrderValue"
                  type="number"
                  placeholder="e.g. 5000"
                  value={minimumOrderValue}
                  onChange={(e) => setMinimumOrderValue(e.target.value)}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="deliveryLocations">
                  Delivery Locations Covered
                </Label>
                <Input
                  id="deliveryLocations"
                  placeholder="e.g. Ahmedabad, Surat, Vadodara, Pan-India"
                  value={deliveryLocations}
                  onChange={(e) => setDeliveryLocations(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 6: Commercial & Bank */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="size-4.5 text-primary" />
                6. Commercial &amp; Bank Details
              </CardTitle>
              <CardDescription className="text-xs">
                Payment terms and verified bank account for settlements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="paymentTerms">Preferred Payment Terms</Label>
                  <Input
                    id="paymentTerms"
                    placeholder="e.g. 30 Days Net"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="creditPeriodDays">Credit Period (Days)</Label>
                  <Input
                    id="creditPeriodDays"
                    type="number"
                    placeholder="30"
                    value={creditPeriodDays}
                    onChange={(e) => setCreditPeriodDays(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="creditLimit">Credit Limit (₹, optional)</Label>
                  <Input
                    id="creditLimit"
                    type="number"
                    placeholder="e.g. 500000"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                  />
                </div>
              </div>

              <div className="border-t pt-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Bank Account (Required before purchase orders)
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="accountHolderName">
                      Account Holder Name
                    </Label>
                    <Input
                      id="accountHolderName"
                      placeholder="Account name as per bank statement"
                      value={accountHolderName}
                      onChange={(e) => setAccountHolderName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="accountNumber">Account Number</Label>
                    <Input
                      id="accountNumber"
                      type="password"
                      placeholder="Enter bank account number"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirmAccountNumber">
                      Confirm Account Number
                    </Label>
                    <Input
                      id="confirmAccountNumber"
                      placeholder="Confirm bank account number"
                      value={confirmAccountNumber}
                      onChange={(e) => setConfirmAccountNumber(e.target.value)}
                    />
                    {accountNumber &&
                      confirmAccountNumber &&
                      accountNumber !== confirmAccountNumber && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="size-3" /> Account numbers do
                          not match.
                        </p>
                      )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ifscCode">IFSC Code</Label>
                    <Input
                      id="ifscCode"
                      maxLength={11}
                      placeholder="e.g. HDFC0000123"
                      value={ifscCode}
                      onChange={(e) =>
                        setIfscCode(e.target.value.toUpperCase().trim())
                      }
                      className="font-mono uppercase"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="bankName">Bank Name</Label>
                    <Input
                      id="bankName"
                      placeholder="e.g. HDFC Bank"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="branch">Branch Name</Label>
                    <Input
                      id="branch"
                      placeholder="e.g. Navrangpura, Ahmedabad"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="upiId">UPI ID (Optional)</Label>
                    <Input
                      id="upiId"
                      placeholder="e.g. vendor@okhdfcbank"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 7: Documents */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="size-4.5 text-primary" />
                7. Document Attachments
              </CardTitle>
              <CardDescription className="text-xs">
                Attach PDF or image copies of statutory certificates and bank
                proofs (up to 20MB each).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gstFile">GST Certificate</Label>
                <Input
                  id="gstFile"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setGstFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="panFile">PAN Copy</Label>
                <Input
                  id="panFile"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setPanFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="chequeFile">
                  Cancelled Cheque / Bank Letter
                </Label>
                <Input
                  id="chequeFile"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => setChequeFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="catalogueFile">
                  Product Catalogue / Brochure
                </Label>
                <Input
                  id="catalogueFile"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) =>
                    setCatalogueFile(e.target.files?.[0] || null)
                  }
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="certificationsFile">
                  ISO / CE / FM / UL Certifications (Optional)
                </Label>
                <Input
                  id="certificationsFile"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(e) =>
                    setCertificationsFile(e.target.files?.[0] || null)
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit Button Bar */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              size="lg"
              type="submit"
              disabled={
                submitMutation.isPending ||
                !displayName.trim() ||
                !contactName.trim() ||
                !phone.trim() ||
                !addressLine1.trim() ||
                !city.trim() ||
                !state.trim() ||
                !postalCode.trim() ||
                (gstStatus === "registered" &&
                  (!gstin.trim() || !legalName.trim()))
              }
              className="min-w-[200px]"
            >
              <Send className="mr-2 size-4" />
              {submitMutation.isPending
                ? "Submitting Registration..."
                : "Submit Registration"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
