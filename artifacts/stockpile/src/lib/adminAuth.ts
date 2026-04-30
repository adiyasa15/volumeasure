import { setAuthTokenGetter } from "@workspace/api-client-react";

const LOCAL_ADMIN_TOKEN_KEY = "pm_admin_token";
const GOOGLE_TOKEN_KEY = "pm_google_token";

export function getLocalAdminToken(): string | null {
  return localStorage.getItem(LOCAL_ADMIN_TOKEN_KEY);
}

export function getGoogleToken(): string | null {
  return localStorage.getItem(GOOGLE_TOKEN_KEY);
}

export function getActiveToken(): string | null {
  return getLocalAdminToken() || getGoogleToken();
}

export function setLocalAdminToken(token: string): void {
  localStorage.setItem(LOCAL_ADMIN_TOKEN_KEY, token);
  setAuthTokenGetter(() => getActiveToken());
}

export function setGoogleToken(token: string): void {
  localStorage.setItem(GOOGLE_TOKEN_KEY, token);
  setAuthTokenGetter(() => getActiveToken());
}

export function clearLocalAdminToken(): void {
  localStorage.removeItem(LOCAL_ADMIN_TOKEN_KEY);
  const remaining = getGoogleToken();
  setAuthTokenGetter(remaining ? () => getActiveToken() : null);
}

export function clearGoogleToken(): void {
  localStorage.removeItem(GOOGLE_TOKEN_KEY);
  const remaining = getLocalAdminToken();
  setAuthTokenGetter(remaining ? () => getActiveToken() : null);
}

export function clearAllTokens(): void {
  localStorage.removeItem(LOCAL_ADMIN_TOKEN_KEY);
  localStorage.removeItem(GOOGLE_TOKEN_KEY);
  setAuthTokenGetter(null);
}

export function initAuthTokenGetter(): void {
  const token = getActiveToken();
  if (token) {
    setAuthTokenGetter(() => getActiveToken());
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
