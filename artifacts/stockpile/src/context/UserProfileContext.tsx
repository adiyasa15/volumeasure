import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  getLocalAdminToken,
  getActiveToken,
  clearLocalAdminToken,
  clearGoogleToken,
  type UserProfile,
} from "@/lib/adminAuth";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";
const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isLocalAdmin = Boolean(getLocalAdminToken());
  const hasToken = Boolean(getActiveToken());

  const fetchProfile = useCallback(async () => {
    const token = getActiveToken();
    if (!token) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/me`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      } else if (res.status === 401) {
        clearLocalAdminToken();
        clearGoogleToken();
        setProfile(null);
      } else {
        setProfile(null);
        setError(`Error ${res.status}`);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken) {
      void fetchProfile();
    } else {
      setProfile(null);
      setLoading(false);
    }
  }, [hasToken, fetchProfile]);

  const logout = useCallback(() => {
    clearLocalAdminToken();
    clearGoogleToken();
    window.location.href = `${window.location.origin}${basePath}/sign-in`;
  }, []);

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
