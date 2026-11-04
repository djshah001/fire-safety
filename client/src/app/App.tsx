import { lazy, Suspense } from "react";
import { createBrowserRouter, Link, RouterProvider } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RouteErrorPage } from "@/components/feedback/RouteErrorPage";

const DashboardPage = lazy(() =>
  import("@/features/foundation/DashboardPage").then((module) => ({
    default: module.DashboardPage,
  })),
);
const EmployeesPage = lazy(() =>
  import("@/features/admin/EmployeesPage").then((module) => ({
    default: module.EmployeesPage,
  })),
);
const RolesPage = lazy(() =>
  import("@/features/admin/RolesPage").then((module) => ({
    default: module.RolesPage,
  })),
);
const LoginPage = lazy(() =>
  import("@/features/auth/LoginPage").then((module) => ({
    default: module.LoginPage,
  })),
);
const ProtectedLayout = lazy(() =>
  import("@/features/auth/ProtectedLayout").then((module) => ({
    default: module.ProtectedLayout,
  })),
);
const AccountPage = lazy(() =>
  import("@/features/auth/AccountPage").then((module) => ({
    default: module.AccountPage,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import("@/features/auth/PasswordResetPages").then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("@/features/auth/PasswordResetPages").then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
const CustomersPage = lazy(() =>
  import("@/features/crm/CustomersPage").then((module) => ({
    default: module.CustomersPage,
  })),
);
const CustomerDetailPage = lazy(() =>
  import("@/features/crm/CustomerDetailPage").then((module) => ({
    default: module.CustomerDetailPage,
  })),
);
const LeadsPage = lazy(() =>
  import("@/features/crm/LeadsPage").then((module) => ({
    default: module.LeadsPage,
  })),
);
const OpportunitiesPage = lazy(() =>
  import("@/features/crm/OpportunitiesPage").then((module) => ({
    default: module.OpportunitiesPage,
  })),
);
const FollowUpsPage = lazy(() => import('@/features/crm/FollowUpsPage').then((module) => ({ default: module.FollowUpsPage })));
const MasterDataPage = lazy(() => import('@/features/masters/MasterDataPage').then((module) => ({ default: module.MasterDataPage })));
const DesignJobsPage = lazy(() => import('@/features/engineering/DesignJobsPage').then((module) => ({ default: module.DesignJobsPage })));
const DesignJobPage = lazy(() => import('@/features/engineering/DesignJobPage').then((module) => ({ default: module.DesignJobPage })));
const BoqWorkspacePage = lazy(() => import('@/features/engineering/BoqWorkspacePage').then((module) => ({ default: module.BoqWorkspacePage })));
const BoqQueuePage = lazy(() => import('@/features/engineering/BoqQueuePage').then((module) => ({ default: module.BoqQueuePage })));
const BoqTemplatesPage = lazy(() => import('@/features/engineering/BoqTemplatesPage').then((module) => ({ default: module.BoqTemplatesPage })));
const QuotationQueuePage = lazy(() => import('@/features/engineering/QuotationQueuePage').then((module) => ({ default: module.QuotationQueuePage })));
const QuotationWorkspacePage = lazy(() => import('@/features/engineering/QuotationWorkspacePage').then((module) => ({ default: module.QuotationWorkspacePage })));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage').then((module) => ({ default: module.NotificationsPage })));
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage').then((module) => ({ default: module.ProjectsPage })));
const ProjectPage = lazy(() => import('@/features/projects/ProjectPage').then((module) => ({ default: module.ProjectPage })));
const RequisitionsPage = lazy(() => import('@/features/procurement/RequisitionsPage').then((module) => ({ default: module.RequisitionsPage })));
const RequisitionWorkspacePage = lazy(() => import('@/features/procurement/RequisitionWorkspacePage').then((module) => ({ default: module.RequisitionWorkspacePage })));
const SubstitutionReviewsPage = lazy(() => import('@/features/procurement/SubstitutionReviewsPage').then((module) => ({ default: module.SubstitutionReviewsPage })));
const SubstitutionReviewWorkspacePage = lazy(() => import('@/features/procurement/SubstitutionReviewWorkspacePage').then((module) => ({ default: module.SubstitutionReviewWorkspacePage })));
const PurchaseOrdersPage = lazy(() => import('@/features/procurement/PurchaseOrdersPage').then((module) => ({ default: module.PurchaseOrdersPage })));
const PurchaseOrderWorkspacePage = lazy(() => import('@/features/procurement/PurchaseOrderWorkspacePage').then((module) => ({ default: module.PurchaseOrderWorkspacePage })));
const PublicVendorRegistrationPage = lazy(() => import('@/features/masters/PublicVendorRegistrationPage').then((module) => ({ default: module.PublicVendorRegistrationPage })));
const PublicPriceSubmissionPage = lazy(() => import('@/features/procurement/PublicPriceSubmissionPage').then((module) => ({ default: module.PublicPriceSubmissionPage })));

function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-muted-foreground">
          This route is not available in the current implementation.
        </p>
        <Button asChild className="mt-6" size="lg">
          <Link to="/">Return home</Link>
        </Button>
      </div>
    </main>
  );
}

const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
      { path: "/vendor-registration/:token", element: <PublicVendorRegistrationPage /> },
      { path: "/vendor-price/:token", element: <PublicPriceSubmissionPage /> },
      {
        element: <ProtectedLayout />,
        errorElement: <RouteErrorPage />,
        children: [
          { path: "/", element: <DashboardPage /> },
          { path: "/admin/employees", element: <EmployeesPage /> },
          { path: "/admin/roles", element: <RolesPage /> },
          { path: "/crm/customers", element: <CustomersPage /> },
          { path: "/crm/customers/:id", element: <CustomerDetailPage /> },
          { path: "/crm/leads", element: <LeadsPage /> },
          { path: "/crm/follow-ups", element: <FollowUpsPage /> },
          { path: "/crm/opportunities", element: <OpportunitiesPage /> },
          { path: "/engineering/design-jobs", element: <DesignJobsPage /> },
          { path: "/engineering/design-jobs/:jobId", element: <DesignJobPage /> },
          { path: "/engineering/design-jobs/:jobId/boq", element: <BoqWorkspacePage /> },
          { path: "/engineering/boqs", element: <BoqQueuePage /> },
          { path: "/masters/boq-templates", element: <BoqTemplatesPage /> },
          { path: "/engineering/quotations", element: <QuotationQueuePage /> },
          { path: "/engineering/design-jobs/:jobId/quotations", element: <QuotationWorkspacePage /> },
          { path: "/masters/vendors", element: <MasterDataPage /> },
          { path: "/masters/items", element: <MasterDataPage /> },
          { path: "/masters/item-families", element: <MasterDataPage /> },
          { path: "/masters/brands", element: <MasterDataPage /> },
          { path: "/masters/item-categories", element: <MasterDataPage /> },
          { path: "/masters/units", element: <MasterDataPage /> },
          { path: "/account", element: <AccountPage /> },
          { path: "/notifications", element: <NotificationsPage /> },
          { path: "/projects", element: <ProjectsPage /> },
          { path: "/projects/:projectId", element: <ProjectPage /> },
          { path: "/procurement/requisitions", element: <RequisitionsPage /> },
          { path: "/procurement/requisitions/:requisitionId", element: <RequisitionWorkspacePage /> },
          { path: "/procurement/purchase-orders", element: <PurchaseOrdersPage /> },
          { path: "/procurement/purchase-orders/:poId", element: <PurchaseOrderWorkspacePage /> },
          { path: "/procurement/substitution-reviews", element: <SubstitutionReviewsPage /> },
          { path: "/procurement/substitution-reviews/:requisitionId", element: <SubstitutionReviewWorkspacePage /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return (
    <TooltipProvider>
      <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
          Loading application…
        </main>
      }
    >
        <RouterProvider router={router} />
      </Suspense>
    </TooltipProvider>
  );
}
