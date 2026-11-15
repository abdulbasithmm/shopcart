import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageView } from '../types';
import { verifyUserRole } from '../services/profileService';
import { supabase, getValidAccessToken } from '../lib/supabase';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';

interface AdminGuardProps {
  children: React.ReactNode;
  onNavigate: (page: PageView, params?: { reason?: string }) => void;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children, onNavigate }) => {
  const { user, isAuthenticated, isSupabaseBackend, isLoading: authLoading } = useAuth();
  const [isVerifying, setIsVerifying] = useState(true);
  const [hasAdminPrivilege, setHasAdminPrivilege] = useState(false);
  const [denialReason, setDenialReason] = useState<string | null>(null);

  const verifiedAdminIdRef = useRef<string | null>(null);

  const userId = user?.id || null;
  const userRole = user?.role || null;

  useEffect(() => {
    let isMounted = true;

    // While AuthContext restores persisted session from Supabase, hold in loading state
    if (authLoading) {
      return;
    }

    const rejectAccess = (reason: string) => {
      verifiedAdminIdRef.current = null;
      if (isMounted) {
        setHasAdminPrivilege(false);
        setDenialReason(reason);
        setIsVerifying(false);
        onNavigate('access-denied', { reason });
      }
    };

    const checkPrivilege = async () => {
      // Avoid unmounting an already-verified AdminPage on background token refresh
      if (!(hasAdminPrivilege && verifiedAdminIdRef.current && verifiedAdminIdRef.current === userId && userRole === 'admin')) {
        setIsVerifying(true);
      }

      // 1. Unauthenticated visitor -> redirect to Admin Login page
      if (!isAuthenticated || !user) {
        verifiedAdminIdRef.current = null;
        if (isMounted) {
          setHasAdminPrivilege(false);
          setIsVerifying(false);
          onNavigate('admin-login');
        }
        return;
      }

      // 2. Reject obvious customer state immediately and redirect to Unauthorized Access page
      if (user.role !== 'admin') {
        verifiedAdminIdRef.current = null;
        if (isMounted) {
          setHasAdminPrivilege(false);
          setDenialReason('Account role in public.profiles is customer. Only role = "admin" is permitted.');
          setIsVerifying(false);
          onNavigate('access-denied');
        }
        return;
      }

      // 3. Server-Authoritative & Database Role Verification (Never trust browser-supplied role or localStorage)
      if (isSupabaseBackend) {
        try {
          // 3a. Ensure we hold a valid, non-expired JWT and verify active session via Supabase getUser(token)
          let accessToken = await getValidAccessToken();
          let { data: userData, error: userErr } = await supabase.auth.getUser(accessToken || undefined);

          if (!accessToken || userErr || !userData?.user) {
            // Try one explicit refresh before concluding there is no active session
            const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
            if (!refreshErr && refreshed?.session?.access_token && refreshed?.session?.user) {
              accessToken = refreshed.session.access_token;
              const recheck = await supabase.auth.getUser(accessToken);
              userData = recheck.data;
              userErr = recheck.error;
            }
          }

          if (!accessToken || userErr || !userData?.user) {
            verifiedAdminIdRef.current = null;
            if (isMounted) {
              setHasAdminPrivilege(false);
              setIsVerifying(false);
              onNavigate('admin-login');
            }
            return;
          }

          if (userData.user.id !== user.id) {
            rejectAccess('Authenticated Supabase Auth user ID does not match active profile ID.');
            return;
          }

          const activeUserId = userData.user.id;

          // 3b. Query server-side verification endpoint (/api/admin/verify-clearance)
          const callVerifyClearance = async (token: string) => {
            return fetch('/api/admin/verify-clearance', {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
          };

          let isServerVerifiedAdmin = false;
          let isStaticHostWithoutApi = false;
          let serverRejectedAuth = false;
          let serverErrorDetail = '';

          try {
            let res = await callVerifyClearance(accessToken);

            // If 401 (expired/stale token), refresh session once and retry
            if (res.status === 401) {
              const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
              if (!refreshErr && refreshed?.session?.access_token) {
                accessToken = refreshed.session.access_token;
                res = await callVerifyClearance(accessToken);
              }
            }

            const contentType = res.headers.get('content-type') || '';

            if (res.status === 404 || (res.ok && !contentType.includes('application/json'))) {
              // Static SPA host (e.g. Vercel without Express /api server); enforce Supabase Auth + PostgreSQL RLS check
              isStaticHostWithoutApi = true;
            } else if (res.status === 401) {
              serverRejectedAuth = true;
            } else if (res.status === 403) {
              const json = contentType.includes('application/json') ? await res.json().catch(() => null) : null;
              serverErrorDetail = json?.error || 'Server clearance verification returned HTTP 403 Forbidden.';
            } else if (res.ok && contentType.includes('application/json')) {
              const json = await res.json();
              if (json.authorized === true && String(json.role || '').trim().toLowerCase() === 'admin') {
                isServerVerifiedAdmin = true;
              } else {
                serverErrorDetail = json?.error || 'Server clearance response did not confirm admin authorization.';
              }
            } else {
              serverErrorDetail = `Server verification endpoint returned HTTP ${res.status}.`;
            }
          } catch (apiErr: any) {
            console.warn('Server clearance check error:', apiErr);
            serverErrorDetail = apiErr?.message || 'Network error reaching /api/admin/verify-clearance.';
          }

          if (serverRejectedAuth) {
            verifiedAdminIdRef.current = null;
            if (isMounted) {
              setHasAdminPrivilege(false);
              setIsVerifying(false);
              onNavigate('admin-login');
            }
            return;
          }

          if (serverErrorDetail) {
            rejectAccess(serverErrorDetail);
            return;
          }

          // 3c. Query public.profiles directly in PostgreSQL via RLS as authoritative DB verification
          const verifiedDbRole = await verifyUserRole(activeUserId);

          if (verifiedDbRole !== 'admin') {
            rejectAccess('Database query to public.profiles did not confirm role = "admin" for this user ID.');
            return;
          }

          // 3d. Confirm PostgreSQL SECURITY DEFINER is_admin() matches
          const { data: rpcIsAdmin, error: rpcErr } = await supabase.rpc('is_admin');

          if (isServerVerifiedAdmin) {
            if (isMounted) {
              verifiedAdminIdRef.current = activeUserId;
              setDenialReason(null);
              setHasAdminPrivilege(true);
              setIsVerifying(false);
            }
            return;
          }

          if (isStaticHostWithoutApi) {
            if (!rpcErr && rpcIsAdmin === false) {
              rejectAccess(
                'PostgreSQL public.is_admin() returned false. Ensure public.profiles.role is exact lowercase "admin" for this user.'
              );
              return;
            }

            if (isMounted) {
              verifiedAdminIdRef.current = activeUserId;
              setDenialReason(null);
              setHasAdminPrivilege(true);
              setIsVerifying(false);
            }
            return;
          }

          rejectAccess('Administrative clearance verification could not be confirmed.');
        } catch (err: any) {
          console.error('Error verifying admin authorization in public.profiles:', err);
          rejectAccess(err?.message || 'Unexpected error verifying admin authorization.');
        }
      } else {
        if (isMounted) {
          if (user.role === 'admin') {
            verifiedAdminIdRef.current = user.id;
            setDenialReason(null);
            setHasAdminPrivilege(true);
          } else {
            rejectAccess('Account does not hold admin role.');
          }
          setIsVerifying(false);
        }
      }
    };

    checkPrivilege();

    return () => {
      isMounted = false;
    };
  }, [userId, userRole, isAuthenticated, isSupabaseBackend, authLoading, onNavigate]);

  // Loading state with session persistence check
  if (authLoading || isVerifying) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-4 text-white">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-[#0b5c37]/30 flex items-center justify-center shadow-lg shadow-emerald-900/10">
          <RefreshCw className="w-6 h-6 text-[#0b5c37] animate-spin" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-white tracking-tight">Verifying Administrative Clearance...</p>
          <p className="text-xs text-slate-400">Checking active session and querying role from Supabase public.profiles</p>
        </div>
      </div>
    );
  }

  // Deny access if user does not possess verified admin role
  if (!hasAdminPrivilege) {
    return <AccessDeniedPage onNavigate={onNavigate} reason={denialReason} />;
  }

  return <>{children}</>;
};
