import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/react";
import { getLocalAdminToken, clearLocalAdminToken, type UserProfile } from "@/lib/adminAuth";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

interface UserProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isLocalAdmin: boolean;
  refetch: () => void;
  logout: () => void;
}

const UserProfileContext = createContext<UserProfileContextValue>({
  profile: null,
  loading: true,
  error: null,
  isLocalAdmin: false,
  refetch: () => {},
  logout: () => {},
});

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const localAdminToken = getLocalAdminToken();
  const isLocalAdmin = Boolean(localAdminToken);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (localAdminToken) {
        headers["Authorization"] = `Bearer ${localAdminToken}`;
      }
      const res = await fetch(`${API_BASE}/admin/me`, {
        credentials: "include",
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      } else {
        setProfile(null);
        if (res.status !== 401) {
          setError(`Error ${res.status}`);
        }
      }
    } catch (e) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [localAdminToken]);

  useEffect(() => {
    if (isLocalAdmin || isSignedIn) {
      fetchProfile();
    } else {
      setProfile(null);
      setLoading(false);
    }
  }, [isLocalAdmin, isSignedIn, fetchProfile]);

  const logout = useCallback(() => {
    if (isLocalAdmin) {
      clearLocalAdminToken();
      window.location.href = window.location.origin + window.location.pathname.replace(/\/$/, "").split("/").slice(0, -1).join("/");
    } else {
      signOut();
    }
  }, [isLocalAdmin, signOut]);

  return (
    <UserProfileContext.Provider
      value={{ profile, loading, error, isLocalAdmin, refetch: fetchProfile, logout }}
    >
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  return useContext(UserProfileContext);
}
