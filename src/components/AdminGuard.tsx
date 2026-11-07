import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageView } from '../types';
import { verifyUserRole } from '../services/profileService';
import { supabase } from '../lib/supabase';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';

interface AdminGuardProps {
  children: React.ReactNode;
  onNavigate: (page: PageView) => void;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children, onNavigate }) => {
  const { user, isAuthenticated, isSupabaseBackend, isLoading: authLoading } = useAuth();
  const [isVerifying, setIsVerifying] = useState(true);
  const [hasAdminPrivilege, setHasAdminPrivilege] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // While AuthContext restores persisted session from Supabase, hold in loading state
    if (authLoading) {
      return;
    }

    const checkPrivilege = async () => {
      setIsVerifying(true);

      // 1. Unauthenticated visitor -> redirect to Admin Login page
      if (!isAuthenticated || !user) {
        if (isMounted) {
          setHasAdminPrivilege(false);
          setIsVerifying(false);
          onNavigate('admin-login');
        }
        return;
      }

      // 2. Reject obvious customer state immediately and redirect to Unauthorized Access page
      if (user.role !== 'admin') {
        if (isMounted) {
          setHasAdminPrivilege(false);
          setIsVerifying(false);
          onNavigate('access-denied');
        }
        return;
      }

      // 3. Demo admin account in local development
      if (user.id === 'usr-demo-admin') {
        if (isMounted) {
          setHasAdminPrivilege(true);
          setIsVerifying(false);
        }
        return;
      }

      // 4. Server-Authoritative & Database Role Verification (Never trust browser-supplied role)
      if (isSupabaseBackend) {
        try {
          // A. Check active JWT with server-side endpoint
          let isServerVerifiedAdmin = false;
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              const res = await fetch('/api/admin/verify-clearance', {
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              });
              const json = await res.json();
              if (json.authorized && json.role === 'admin') {
                isServerVerifiedAdmin = true;
              }
            }
          } catch (apiErr) {
            console.warn('Server clearance check error:', apiErr);
          }

          // B. Query public.profiles directly in PostgreSQL via RLS
          const verifiedDbRole = await verifyUserRole(user.id);

          if (isMounted) {
            if (isServerVerifiedAdmin || verifiedDbRole === 'admin') {
              setHasAdminPrivilege(true);
            } else {
              setHasAdminPrivilege(false);
              onNavigate('access-denied');
            }
            setIsVerifying(false);
          }
        } catch (err) {
          console.error('Error verifying admin authorization in public.profiles:', err);
          if (isMounted) {
            setHasAdminPrivilege(false);
            setIsVerifying(false);
            onNavigate('access-denied');
          }
        }
      } else {
        if (isMounted) {
          if (user.role === 'admin') {
            setHasAdminPrivilege(true);
          } else {
            setHasAdminPrivilege(false);
            onNavigate('access-denied');
          }
          setIsVerifying(false);
        }
      }
    };

    checkPrivilege();

    return () => {
      isMounted = false;
    };
  }, [user, isAuthenticated, isSupabaseBackend, authLoading, onNavigate]);

  // Loading state with session persistence check (Requirement 14)
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

  // Deny access if user does not possess verified admin role (Requirement 5 & 6)
  if (!hasAdminPrivilege) {
    return <AccessDeniedPage onNavigate={onNavigate} />;
  }

  return <>{children}</>;
};
