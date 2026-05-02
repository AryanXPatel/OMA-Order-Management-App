export const MANAGER_ROLE = "Manager";
export const WORKER_ROLE = "Worker";

export type AppRole = typeof MANAGER_ROLE | typeof WORKER_ROLE;

export const normalizeAppRole = (
  role: string | null | undefined
): AppRole | "" => {
  const normalized = String(role ?? "").trim().toLowerCase();

  if (normalized === "manager" || normalized === "owner") {
    return MANAGER_ROLE;
  }

  if (normalized === "worker" || normalized === "user") {
    return WORKER_ROLE;
  }

  return "";
};

export const isManagerRole = (role: string | null | undefined) =>
  normalizeAppRole(role) === MANAGER_ROLE;

export const isWorkerOrderUser = (user: string | null | undefined) => {
  const normalized = String(user ?? "").trim().toLowerCase();
  return normalized === "worker" || normalized === "user";
};

export const formatRoleLabel = (role: string | null | undefined) =>
  normalizeAppRole(role) || String(role ?? "").trim();
