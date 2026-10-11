import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PublicPageShell, useHomePath } from "@/components/layout/PublicPageShell";

const NotFound = () => {
  const { t } = useTranslation();
  const home = useHomePath();

  return (
    <PublicPageShell className="flex min-h-[60vh] max-w-[65ch] flex-col items-center justify-center text-center">
      <h1 className="mb-4 text-4xl font-bold tracking-tight">{t('notFound.title')}</h1>
      <p className="mb-6 text-xl text-muted-foreground">{t('notFound.message')}</p>
      {/* An in-app link: no full reload through the startup shell, and signed-in users stay in the app. */}
      <Button asChild>
        <Link to={home}>{t('notFound.link')}</Link>
      </Button>
    </PublicPageShell>
  );
};

export default NotFound;
