import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileCheck2,
  FileText,
  Gauge,
  GitPullRequest,
  Image as ImageIcon,
  ListTodo,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Truck,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { currentUserQuery } from "@/api/auth";
import { getApiErrorMessage } from "@/api/client";
import {
  createSiteReturn,
  deliveryChallanPdfUrl,
  deliveryChallanPodPhotoUrl,
  deliveryChallansQuery,
  siteReturnsQuery,
  stockBalancesQuery,
  verifyPod,
  warehousesQuery,
  type DeliveryChallan,
} from "@/api/inventory";
import {
  addProjectMember,
  eligibleProjectMembersQuery,
  projectQuery,
  removeProjectMember,
} from "@/api/projects";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DailyProgressReportsTab } from "./execution/DailyProgressReportsTab";
import { DelaysTab } from "./execution/DelaysTab";
import { ExpensesTab } from "./execution/ExpensesTab";
import { MilestonesTasksTab } from "./execution/MilestonesTasksTab";
import { VariationsTab } from "./execution/VariationsTab";
import { InspectionsTab } from "./quality/InspectionsTab";
import { TestReportsTab } from "./quality/TestReportsTab";
import { PunchItemsTab } from "./quality/PunchItemsTab";
import { HandoverTab } from "./quality/HandoverTab";

export function ProjectPage() {
  const { projectId } = useParams();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "overview";

  // Team member dialog states
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("member");

  // Materials / POD states
  const [podSheetOpen, setPodSheetOpen] = useState(false);
  const [selectedDc, setSelectedDc] = useState<DeliveryChallan | null>(null);
  const [podPhotoFile, setPodPhotoFile] = useState<File | null>(null);
  const [podNotes, setPodNotes] = useState("");
  const [podLines, setPodLines] = useState<
    Array<{
      dcLineId: string;
      verifiedReceivedQty: string;
      damagedOrShortQty: string;
      lineRemarks: string;
    }>
  >([]);

  // Site Return states
  const [returnSheetOpen, setReturnSheetOpen] = useState(false);
  const [returnWarehouseId, setReturnWarehouseId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnQtyByKey, setReturnQtyByKey] = useState<Record<string, string>>(
    {},
  );

  const { data: currentUser } = useQuery(currentUserQuery);
  const query = useQuery(projectQuery(projectId));
  const eligibleQuery = useQuery(eligibleProjectMembersQuery(projectId));
  const challansQuery = useQuery({
    ...deliveryChallansQuery({ projectId }),
    enabled: Boolean(projectId),
  });
  const returnsQuery = useQuery({
    ...siteReturnsQuery({ projectId }),
    enabled: Boolean(projectId),
  });
  const warehouses = useQuery(warehousesQuery(false));
  const siteBalancesQuery = useQuery({
    ...stockBalancesQuery({ warehouseId: returnWarehouseId || undefined }),
    enabled: Boolean(returnSheetOpen && returnWarehouseId),
  });

  const verifyPodMutation = useMutation({
    mutationFn: ({ dcId, formData }: { dcId: string; formData: FormData }) =>
      verifyPod(dcId, formData),
    onSuccess: (updatedDc) => {
      toast.success(
        `POD recorded for ${updatedDc.dcNumber} (${updatedDc.status.replace(/_/g, " ")})`,
      );
      setPodSheetOpen(false);
      setPodPhotoFile(null);
      setPodNotes("");
      queryClient.invalidateQueries({
        queryKey: ["inventory", "delivery-challans"],
      });
      queryClient.invalidateQueries({ queryKey: ["inventory", "balances"] });
      queryClient.invalidateQueries({
        queryKey: ["inventory", "material-issue-requests"],
      });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, "POD verification failed"));
    },
  });

  const siteReturnMutation = useMutation({
    mutationFn: createSiteReturn,
    onSuccess: (ret) => {
      toast.success(
        `Site return ${ret.returnNumber} submitted to Store for acceptance`,
      );
      setReturnSheetOpen(false);
      setReturnReason("");
      setReturnQtyByKey({});
      queryClient.invalidateQueries({
        queryKey: ["inventory", "site-returns"],
      });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, "Failed to submit site return"));
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: (input: { userId: string; role?: string }) =>
      addProjectMember(projectId!, input),
    onSuccess: () => {
      toast.success("Team member added successfully");
      setAddMemberOpen(false);
      setSelectedUserId("");
      setSelectedRole("member");
      queryClient.invalidateQueries({
        queryKey: projectQuery(projectId).queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: eligibleProjectMembersQuery(projectId).queryKey,
      });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, "Failed to add team member"));
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeProjectMember(projectId!, userId),
    onSuccess: () => {
      toast.success("Team member removed");
      queryClient.invalidateQueries({
        queryKey: projectQuery(projectId).queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: eligibleProjectMembersQuery(projectId).queryKey,
      });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, "Failed to remove team member"));
    },
  });

  if (query.isPending) {
    return (
      <main className="mx-auto max-w-6xl space-y-5 p-6">
        <Skeleton className="h-9 w-60" />
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </main>
    );
  }

  if (query.isError) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Button asChild variant="ghost">
          <Link to="/projects">
            <ArrowLeft className="mr-2 size-4" />
            Projects
          </Link>
        </Button>
        <Alert className="mt-6" variant="destructive">
          <AlertTitle>Project unavailable</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(
              query.error,
              "This project is outside your assignment.",
            )}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const { project, members, designBaseline, commercialBaseline } = query.data;

  const handleTabChange = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", value);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Back button and Header */}
      <div>
        <Button asChild className="-ml-2" variant="ghost">
          <Link to="/projects">
            <ArrowLeft className="mr-2 size-4" />
            Projects
          </Link>
        </Button>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-primary">
              {project.projectNumber}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {project.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {project.customerName} · {project.siteName}
            </p>
          </div>
          <div className="flex gap-2">
            <StatusBadge status={project.status} />
            <StatusBadge status={project.commercialState} />
          </div>
        </div>
      </div>

      {/* Commercial State Notice */}
      {project.commercialState !== "awarded" && (
        <Alert>
          <AlertTitle>Project started before commercial award</AlertTitle>
          <AlertDescription>
            Quotation acceptance or customer PO is not a project-start
            requirement. The commercial state remains {project.commercialState};
            procurement and execution proceed independently.
          </AlertDescription>
        </Alert>
      )}

      {/* Execution Workspace Tabs */}
      <Tabs
        value={currentTab}
        onValueChange={handleTabChange}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-6 lg:grid-cols-11 h-auto gap-1 p-1">
          <TabsTrigger
            value="overview"
            className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
          >
            <FileCheck2 className="size-4" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger
            value="materials"
            className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
          >
            <Truck className="size-4" />
            <span>Materials</span>
          </TabsTrigger>
          <TabsTrigger
            value="tasks"
            className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
          >
            <ListTodo className="size-4" />
            <span>Tasks</span>
          </TabsTrigger>
          <TabsTrigger
            value="dpr"
            className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
          >
            <FileText className="size-4" />
            <span>DPR</span>
          </TabsTrigger>
          <TabsTrigger
            value="delays"
            className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
          >
            <Clock className="size-4" />
            <span>Delays</span>
          </TabsTrigger>
          <TabsTrigger
            value="variations"
            className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
          >
            <GitPullRequest className="size-4" />
            <span>Variations</span>
          </TabsTrigger>
          <TabsTrigger
            value="expenses"
            className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
          >
            <Receipt className="size-4" />
            <span>Expenses</span>
          </TabsTrigger>
          <TabsTrigger
            value="inspections"
            className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
          >
            <ClipboardCheck className="size-4" />
            <span>Inspections</span>
          </TabsTrigger>
          <TabsTrigger
            value="tests"
            className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
          >
            <Gauge className="size-4" />
            <span>Tests</span>
          </TabsTrigger>
          <TabsTrigger
            value="snags"
            className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
          >
            <Wrench className="size-4" />
            <span>Punch List</span>
          </TabsTrigger>
          <TabsTrigger
            value="handover"
            className="flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
          >
            <ShieldCheck className="size-4" />
            <span>Handover</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>Started</CardDescription>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="size-4" />
                  {new Date(
                    `${project.startDate}T00:00:00`,
                  ).toLocaleDateString()}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {project.startReason}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Target completion</CardDescription>
                <CardTitle className="text-base">
                  {new Date(
                    `${project.targetCompletionDate}T00:00:00`,
                  ).toLocaleDateString()}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Commercial baseline</CardDescription>
                <CardTitle className="text-base">
                  {commercialBaseline
                    ? `Quotation R${commercialBaseline.quotationRevisionNumber}`
                    : "Not yet accepted"}
                </CardTitle>
              </CardHeader>
              {commercialBaseline && (
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    Accepted{" "}
                    {new Date(commercialBaseline.acceptedAt).toLocaleString()}
                  </p>
                  {(currentUser?.permissions.includes("system.access.all") ||
                    currentUser?.permissions.includes(
                      "procurement.sourcing.read",
                    ) ||
                    currentUser?.permissions.includes(
                      "inventory.request.create",
                    )) && (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                    >
                      <Link
                        to={`/procurement/fulfillment?quotationRevisionId=${commercialBaseline.quotationRevisionId}`}
                      >
                        Open Fulfillment Plan
                      </Link>
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck2 className="size-5" />
                  Design baseline
                </CardTitle>
                <CardDescription>
                  Immutable technical authority used to start this project.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {designBaseline ? (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium">
                      R{designBaseline.designRevisionNumber} ·{" "}
                      {designBaseline.designTitle}
                    </p>
                    <p className="text-muted-foreground">
                      Customer evidence: {designBaseline.customerEvidence}
                    </p>
                    <p>
                      <Badge variant="secondary">
                        {designBaseline.boqRevisionId
                          ? "Approved BOQ linked"
                          : "No BOQ required at start"}
                      </Badge>
                    </p>
                  </div>
                ) : (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Design baseline is unavailable.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="size-5" />
                      Assigned team
                    </CardTitle>
                    <CardDescription>
                      Only explicit members can open this project.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => setAddMemberOpen(true)}
                  >
                    <UserPlus className="size-3.5" />
                    Add Member
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {members.map((member) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    key={member.userId}
                  >
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {member.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {member.role.replaceAll("_", " ")}
                      </Badge>
                      {members.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          title={`Remove ${member.name}`}
                          disabled={removeMemberMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove ${member.name} from this project?`,
                              )
                            ) {
                              removeMemberMutation.mutate(member.userId);
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Milestones & Tasks */}
        <TabsContent value="tasks">
          <MilestonesTasksTab projectId={projectId!} members={members} />
        </TabsContent>

        {/* Tab 3: Daily Progress Reports */}
        <TabsContent value="dpr">
          <DailyProgressReportsTab projectId={projectId!} />
        </TabsContent>

        {/* Tab 4: Delays */}
        <TabsContent value="delays">
          <DelaysTab projectId={projectId!} />
        </TabsContent>

        {/* Tab 5: Variations */}
        <TabsContent value="variations">
          <VariationsTab projectId={projectId!} />
        </TabsContent>

        {/* Tab 6: Expenses */}
        <TabsContent value="expenses">
          <ExpensesTab projectId={projectId!} />
        </TabsContent>

        {/* Tab 7: Inspections */}
        <TabsContent value="inspections">
          <InspectionsTab projectId={projectId!} />
        </TabsContent>

        {/* Tab 8: Test Reports */}
        <TabsContent value="tests">
          <TestReportsTab projectId={projectId!} />
        </TabsContent>

        {/* Tab 9: Punch List */}
        <TabsContent value="snags">
          <PunchItemsTab projectId={projectId!} members={members} />
        </TabsContent>

        {/* Tab 10: Handover */}
        <TabsContent value="handover">
          <HandoverTab projectId={projectId!} />
        </TabsContent>

        {/* Tab 11: Materials & Deliveries (Site POD & Returns) */}
        <TabsContent value="materials" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck className="size-4" />
                  Incoming Delivery Challans (POD)
                </CardTitle>
                <CardDescription className="text-xs">
                  Verify material delivered from Store against physical signed
                  Delivery Challans.
                </CardDescription>
              </div>
              {(currentUser?.permissions.includes("system.access.all") ||
                currentUser?.permissions.includes(
                  "inventory.site_return.create",
                ) ||
                currentUser?.permissions.includes("inventory.pod.verify")) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    const defaultWh =
                      warehouses.data?.find(
                        (w) => w.warehouseType === "central_warehouse",
                      )?.id ??
                      warehouses.data?.[0]?.id ??
                      "";
                    setReturnWarehouseId(defaultWh);
                    setReturnSheetOpen(true);
                  }}
                >
                  <RotateCcw className="size-3.5" />
                  Return Leftover Stock to Store
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DC #</TableHead>
                    <TableHead>MIR #</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dispatched By</TableHead>
                    <TableHead>Dispatched At</TableHead>
                    <TableHead>Verified At</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(challansQuery.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No delivery challans dispatched for this project yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (challansQuery.data ?? []).map((dc) => (
                      <TableRow key={dc.id}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {dc.dcNumber}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {dc.mirNumber}
                        </TableCell>
                        <TableCell className="text-xs">
                          {dc.warehouseName}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              dc.status === "verified"
                                ? "default"
                                : dc.status === "discrepancy_pending"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {dc.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {dc.dispatchedByUserName}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(dc.dispatchedAt).toLocaleDateString(
                            "en-IN",
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {dc.verifiedAt
                            ? new Date(dc.verifiedAt).toLocaleDateString(
                                "en-IN",
                              )
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {dc.hasPdf && (
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2"
                              >
                                <a
                                  href={deliveryChallanPdfUrl(dc.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  PDF
                                </a>
                              </Button>
                            )}
                            {dc.hasPodPhoto && (
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2"
                              >
                                <a
                                  href={deliveryChallanPodPhotoUrl(dc.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <ImageIcon className="h-3 w-3 mr-1" />
                                  POD
                                </a>
                              </Button>
                            )}
                            {dc.status === "dispatched" &&
                              (currentUser?.permissions.includes(
                                "system.access.all",
                              ) ||
                                currentUser?.permissions.includes(
                                  "inventory.pod.verify",
                                )) && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => {
                                    setSelectedDc(dc);
                                    setPodPhotoFile(null);
                                    setPodNotes("");
                                    setPodLines(
                                      dc.lines.map((l) => ({
                                        dcLineId: l.id,
                                        verifiedReceivedQty: l.dispatchedQty,
                                        damagedOrShortQty: "0",
                                        lineRemarks: "",
                                      })),
                                    );
                                    setPodSheetOpen(true);
                                  }}
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Verify POD
                                </Button>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {(returnsQuery.data ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <RotateCcw className="size-4" />
                  Site-to-Store Return Challans
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return #</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Lines</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(returnsQuery.data ?? []).map((ret) => (
                      <TableRow key={ret.id}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {ret.returnNumber}
                        </TableCell>
                        <TableCell className="text-xs">
                          {ret.warehouseName}
                        </TableCell>
                        <TableCell className="text-xs">{ret.reason}</TableCell>
                        <TableCell className="text-xs">
                          {ret.lines
                            .map(
                              (l) =>
                                `${l.itemCode}: ${Number(l.quantity).toFixed(2)} ${l.unitSymbol}`,
                            )
                            .join(", ")}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              ret.status === "accepted"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {ret.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(ret.submittedAt).toLocaleDateString(
                            "en-IN",
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Verify POD Sheet */}
      <Sheet open={podSheetOpen} onOpenChange={setPodSheetOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              Verify Delivery (POD) — {selectedDc?.dcNumber}
            </SheetTitle>
            <SheetDescription>
              Upload the signed physical Delivery Challan photo and confirm
              quantities received at site.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-1.5">
              <Label>Signed DC Photo * (PDF, JPEG, or PNG up to 20 MiB)</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(e) => setPodPhotoFile(e.target.files?.[0] ?? null)}
              />
              {!podPhotoFile && (
                <p className="text-xs text-destructive">
                  Required: attach photo/scan of signed Delivery Challan
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Verification Notes (Optional)</Label>
              <Textarea
                rows={2}
                placeholder="Site condition remarks or receiver notes..."
                value={podNotes}
                onChange={(e) => setPodNotes(e.target.value)}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              {podLines.map((line, idx) => {
                const dcLine = selectedDc?.lines[idx];
                const dispatchedQty = Number(dcLine?.dispatchedQty ?? 0);
                const verified = Number(line.verifiedReceivedQty);
                const damaged = Number(line.damagedOrShortQty);
                const isValid =
                  verified >= 0 &&
                  damaged >= 0 &&
                  Math.abs(verified + damaged - dispatchedQty) < 0.0001;

                return (
                  <div
                    key={line.dcLineId}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs font-semibold">
                          {dcLine?.itemCode}
                        </p>
                        <p className="text-xs font-medium">
                          {dcLine?.itemName}
                        </p>
                        {dcLine?.brandName && (
                          <p className="text-xs text-muted-foreground">
                            {dcLine.brandName}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        Dispatched: {dispatchedQty.toFixed(2)}{" "}
                        {dcLine?.unitSymbol}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Verified Received Qty</Label>
                        <Input
                          type="number"
                          min="0"
                          max={dispatchedQty}
                          step="0.0001"
                          className="h-8"
                          value={line.verifiedReceivedQty}
                          onChange={(e) =>
                            setPodLines((prev) =>
                              prev.map((l, i) =>
                                i === idx
                                  ? {
                                      ...l,
                                      verifiedReceivedQty: e.target.value,
                                    }
                                  : l,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Damaged / Short Qty</Label>
                        <Input
                          type="number"
                          min="0"
                          max={dispatchedQty}
                          step="0.0001"
                          className="h-8"
                          value={line.damagedOrShortQty}
                          onChange={(e) =>
                            setPodLines((prev) =>
                              prev.map((l, i) =>
                                i === idx
                                  ? { ...l, damagedOrShortQty: e.target.value }
                                  : l,
                              ),
                            )
                          }
                        />
                      </div>
                    </div>
                    <Input
                      placeholder="Line remarks (optional)"
                      className="h-8 text-xs"
                      value={line.lineRemarks}
                      onChange={(e) =>
                        setPodLines((prev) =>
                          prev.map((l, i) =>
                            i === idx
                              ? { ...l, lineRemarks: e.target.value }
                              : l,
                          ),
                        )
                      }
                    />
                    {!isValid && (
                      <p className="text-xs text-destructive">
                        Verified + Damaged must equal Dispatched (
                        {dispatchedQty.toFixed(2)})
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setPodSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !podPhotoFile ||
                verifyPodMutation.isPending ||
                podLines.some((l, idx) => {
                  const d = Number(selectedDc?.lines[idx]?.dispatchedQty ?? 0);
                  const v = Number(l.verifiedReceivedQty);
                  const dmg = Number(l.damagedOrShortQty);
                  return v < 0 || dmg < 0 || Math.abs(v + dmg - d) > 0.0001;
                })
              }
              onClick={() => {
                if (!selectedDc || !podPhotoFile) return;
                const formData = new FormData();
                formData.append("photo", podPhotoFile);
                formData.append("rowVersion", String(selectedDc.rowVersion));
                if (podNotes.trim()) {
                  formData.append("verificationNotes", podNotes.trim());
                }
                formData.append(
                  "lines",
                  JSON.stringify(
                    podLines.map((l) => ({
                      dcLineId: l.dcLineId,
                      verifiedReceivedQty: Number(
                        l.verifiedReceivedQty,
                      ).toFixed(4),
                      damagedOrShortQty: Number(l.damagedOrShortQty).toFixed(4),
                      ...(l.lineRemarks.trim()
                        ? { lineRemarks: l.lineRemarks.trim() }
                        : {}),
                    })),
                  ),
                );
                verifyPodMutation.mutate({ dcId: selectedDc.id, formData });
              }}
            >
              {verifyPodMutation.isPending
                ? "Submitting..."
                : "Submit POD Verification"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Return Leftover Stock Sheet */}
      <Sheet open={returnSheetOpen} onOpenChange={setReturnSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Return Leftover Stock to Store</SheetTitle>
            <SheetDescription>
              Submit a Site-to-Store Return Challan for unused material
              currently at this project site.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Destination Store Warehouse *</Label>
              <Select
                value={returnWarehouseId}
                onValueChange={setReturnWarehouseId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {(warehouses.data ?? []).map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.code} - {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Return Reason *</Label>
              <Textarea
                rows={2}
                placeholder="e.g. Excess pipe length remaining after completion"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Site Stock Available to Return
              </p>
              {(siteBalancesQuery.data ?? []).filter(
                (b) =>
                  b.locationType === "site" &&
                  b.projectId === projectId &&
                  Number(b.quantityOnHand) > 0,
              ).length === 0 ? (
                <p className="text-xs text-muted-foreground py-3">
                  No verified material currently held at this project site
                  location.
                </p>
              ) : (
                (siteBalancesQuery.data ?? [])
                  .filter(
                    (b) =>
                      b.locationType === "site" &&
                      b.projectId === projectId &&
                      Number(b.quantityOnHand) > 0,
                  )
                  .map((b) => {
                    const key = `${b.itemId}:${b.brandOfferingId ?? ""}`;
                    return (
                      <div
                        key={b.id}
                        className="rounded-lg border p-3 flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="font-mono text-xs font-semibold">
                            {b.itemCode}
                          </p>
                          <p className="text-xs">{b.itemName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {b.brandName ?? "Generic"} · At site:{" "}
                            {Number(b.quantityOnHand).toFixed(2)} {b.unitSymbol}
                          </p>
                        </div>
                        <Input
                          type="number"
                          min="0"
                          max={b.quantityOnHand}
                          step="0.0001"
                          placeholder="0"
                          className="w-28 h-8 text-right font-mono text-xs"
                          value={returnQtyByKey[key] ?? ""}
                          onChange={(e) =>
                            setReturnQtyByKey((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    );
                  })
              )}
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setReturnSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !returnWarehouseId ||
                returnReason.trim().length < 3 ||
                siteReturnMutation.isPending
              }
              onClick={() => {
                const siteRows = (siteBalancesQuery.data ?? []).filter(
                  (b) =>
                    b.locationType === "site" &&
                    b.projectId === projectId &&
                    Number(b.quantityOnHand) > 0,
                );
                const lines = siteRows
                  .map((b) => {
                    const key = `${b.itemId}:${b.brandOfferingId ?? ""}`;
                    const qty = Number(returnQtyByKey[key] ?? "0");
                    if (qty <= 0) return null;
                    return {
                      itemId: b.itemId,
                      brandOfferingId: b.brandOfferingId,
                      quantity: qty.toFixed(4),
                    };
                  })
                  .filter((l): l is NonNullable<typeof l> => Boolean(l));

                if (lines.length === 0) {
                  toast.error(
                    "Enter a positive return quantity for at least one site item.",
                  );
                  return;
                }
                siteReturnMutation.mutate({
                  projectId: projectId!,
                  warehouseId: returnWarehouseId,
                  reason: returnReason.trim(),
                  lines,
                });
              }}
            >
              {siteReturnMutation.isPending
                ? "Submitting..."
                : "Submit Return Challan"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Add Team Member Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Select an active company employee to add to this project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Employee *</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select active employee" />
                </SelectTrigger>
                <SelectContent>
                  {!eligibleQuery.data || eligibleQuery.data.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No other eligible employees found
                    </SelectItem>
                  ) : (
                    eligibleQuery.data.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name} ({emp.email})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Project Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Team Member</SelectItem>
                  <SelectItem value="project_manager">
                    Project Manager
                  </SelectItem>
                  <SelectItem value="site_engineer">Site Engineer</SelectItem>
                  <SelectItem value="design">Design Engineer</SelectItem>
                  <SelectItem value="purchase">Purchase Executive</SelectItem>
                  <SelectItem value="sales">Sales Liaison</SelectItem>
                  <SelectItem value="viewer">Viewer (Read-Only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !selectedUserId ||
                selectedUserId === "none" ||
                addMemberMutation.isPending
              }
              onClick={() => {
                addMemberMutation.mutate({
                  userId: selectedUserId,
                  role: selectedRole,
                });
              }}
            >
              {addMemberMutation.isPending ? "Adding..." : "Add to Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
