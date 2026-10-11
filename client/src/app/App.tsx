import { lazy, Suspense } from "react";
import { createBrowserRouter, Link, RouterProvider } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";

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
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: <ProtectedLayout />,
    children: [
      { path: "/", element: <DashboardPage /> },
      { path: "/admin/employees", element: <EmployeesPage /> },
      { path: "/admin/roles", element: <RolesPage /> },
      { path: "/crm/customers", element: <CustomersPage /> },
      { path: "/crm/customers/:id", element: <CustomerDetailPage /> },
      { path: "/crm/leads", element: <LeadsPage /> },
      { path: "/crm/follow-ups", element: <FollowUpsPage /> },
      { path: "/crm/opportunities", element: <OpportunitiesPage /> },
      { path: "/account", element: <AccountPage /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
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
