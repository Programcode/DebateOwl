import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/supabase/AuthProvider";

export function AccountQueryCache(): null {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const previousUserId = useRef(user?.id ?? null);

  useEffect(() => {
    const nextUserId = user?.id ?? null;
    if (previousUserId.current !== nextUserId) queryClient.clear();
    previousUserId.current = nextUserId;
  }, [queryClient, user?.id]);

  return null;
}
