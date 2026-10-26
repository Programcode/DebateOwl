import { Link } from "react-router-dom";
import { Owl } from "@/components/brand/Owl";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PublicPageShell, useHomePath } from "@/components/layout/PublicPageShell";
import { usePageHead } from "@/lib/seo/use-page-head";

const NotFound = () => {
  const { t } = useTranslation();
  const home = useHomePath();
  // Not indexed, and no canonical URL that would point a crawler elsewhere.
  usePageHead("*");

  return (
    <PublicPageShell className="flex min-h-[60vh] max-w-[65ch] flex-col items-center justify-center text-center">
      {/* The owl is as surprised as you are. */}
      <Owl pose="surprised" size={168} priority className="mb-2" />
      <h1 className="mb-3 font-display text-6xl font-[600] tracking-[-0.02em] text-heading">{t('notFound.title')}</h1>
      <p className="mb-6 text-xl text-muted-foreground">{t('notFound.message')}</p>
      {/* An in-app link: no full reload through the startup shell, and signed-in users stay in the app. */}
      <Button asChild>
        <Link to={home}>{t('notFound.link')}</Link>
      </Button>
    </PublicPageShell>
  );
};

export default NotFound;
