import { apiClient, type ApiEnvelope } from "@/api/client";

export type GlobalSearchResult = {
  leads: Array<{ id: string; leadNumber: string; inquiryName: string }>;
  designJobs: Array<{ id: string; leadNumber: string; title: string }>;
  projects: Array<{ id: string; code: string; name: string }>;
  vendors: Array<{ id: string; code: string; name: string }>;
};

type PageEnvelope<T> = ApiEnvelope<{ items: T[] }>;

export function canAccessDesignJobs(permissions: readonly string[]) {
  if (permissions.includes("system.access.all")) return true;
  return [
    "engineering.design.write",
    "engineering.design.review",
    "engineering.design.customer_decision",
    "engineering.estimate.read",
    "project.start",
  ].some((perm) => permissions.includes(perm));
}

export function canAccessBoqs(permissions: readonly string[]) {
  if (permissions.includes("system.access.all")) return true;
  return [
    "engineering.design.write",
    "engineering.design.review",
    "engineering.design.customer_decision",
    "engineering.estimate.read",
  ].some((perm) => permissions.includes(perm));
}

export async function searchGlobalMetadata(
  query: string,
  permissions: readonly string[],
  signal?: AbortSignal,
): Promise<GlobalSearchResult> {
  const hasPerm = (perm: string) =>
    permissions.includes("system.access.all") || permissions.includes(perm);

  const leadsPromise = hasPerm("crm.lead.read")
    ? apiClient
        .get<
          PageEnvelope<{ id: string; leadNumber: string; inquiryName: string }>
        >("/crm/leads", {
          params: { search: query, page: 1, pageSize: 5 },
          signal,
        })
        .then((res) => res.data.data.items)
    : Promise.resolve([]);

  const designJobsPromise = canAccessDesignJobs(permissions)
    ? apiClient
        .get<PageEnvelope<{ id: string; leadNumber: string; title: string }>>(
          "/engineering/design-jobs",
          { params: { search: query, page: 1, pageSize: 5 }, signal },
        )
        .then((res) => res.data.data.items)
    : Promise.resolve([]);

  const projectsPromise = hasPerm("project.read")
    ? apiClient
        .get<
          PageEnvelope<{ id: string; projectNumber: string; title: string }>
        >("/projects", {
          params: { search: query, page: 1, pageSize: 5 },
          signal,
        })
        .then((res) =>
          res.data.data.items.map((project) => ({
            id: project.id,
            code: project.projectNumber,
            name: project.title,
          })),
        )
    : Promise.resolve([]);

  const vendorsPromise = hasPerm("procurement.vendor.read")
    ? apiClient
        .get<PageEnvelope<{ id: string; code: string; displayName: string }>>(
          "/masters/vendors",
          {
            params: { search: query, page: 1, pageSize: 5 },
            signal,
          },
        )
        .then((res) =>
          res.data.data.items.map((vendor) => ({
            id: vendor.id,
            code: vendor.code,
            name: vendor.displayName,
          })),
        )
    : Promise.resolve([]);

  const [leadsRes, jobsRes, projectsRes, vendorsRes] = await Promise.allSettled([
    leadsPromise,
    designJobsPromise,
    projectsPromise,
    vendorsPromise,
  ]);

  return {
    leads: leadsRes.status === "fulfilled" ? leadsRes.value : [],
    designJobs: jobsRes.status === "fulfilled" ? jobsRes.value : [],
    projects: projectsRes.status === "fulfilled" ? projectsRes.value : [],
    vendors: vendorsRes.status === "fulfilled" ? vendorsRes.value : [],
  };
}
