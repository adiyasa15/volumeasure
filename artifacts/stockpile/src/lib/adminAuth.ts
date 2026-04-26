import { setAuthTokenGetter } from "@workspace/api-client-react";

const LOCAL_ADMIN_TOKEN_KEY = "pm_admin_token";

export function getLocalAdminToken(): string | null {
  return localStorage.getItem(LOCAL_ADMIN_TOKEN_KEY);
}

export function setLocalAdminToken(token: string): void {
  localStorage.setItem(LOCAL_ADMIN_TOKEN_KEY, token);
  // Tell the api client to send this as Bearer for all requests
  setAuthTokenGetter(() => getLocalAdminToken());
}

export function clearLocalAdminToken(): void {
  localStorage.removeItem(LOCAL_ADMIN_TOKEN_KEY);
  setAuthTokenGetter(null);
}

export function initAuthTokenGetter(): void {
  const token = getLocalAdminToken();
  if (token) {
    setAuthTokenGetter(() => getLocalAdminToken());
  }
}

export type UserRole = "super_admin" | "admin" | "user" | "readonly";
export type UserStatus = "pending" | "approved" | "suspended";

export interface UserProfile {
  id: string;
  clerkUserId: string | null;
  username: string | null;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
