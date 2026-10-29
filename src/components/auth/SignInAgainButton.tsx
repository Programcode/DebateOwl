import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { endSessionToSignInAgain } from '@/lib/supabase/session-expiry';

/** The next step after the server refused this session: sign out and open the login page. */
export function SignInAgainButton({ size = 'sm', variant = 'outline', className }: Pick<ButtonProps, 'size' | 'variant' | 'className'>) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      disabled={pending}
      onClick={() => {
        setPending(true);
        endSessionToSignInAgain(supabase.auth).catch(() => setPending(false));
      }}
    >
      <LogIn className="mr-1.5 h-4 w-4" aria-hidden="true" />
      {t('aiErrors.signInAgain')}
    </Button>
  );
}
