import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PublicPageShell, useHomePath } from "@/components/layout/PublicPageShell";
import { usePageHead } from "@/lib/seo/use-page-head";

const NotFound = () => {
  const { t } = useTranslation();
  const home = useHomePath();
  // Not indexed, and no canonical URL that would point a crawler elsewhere.
  usePageHead("*");

  return (
    <PublicPageShell className="flex min-h-[60vh] max-w-xl flex-col justify-center">
      {/* The owl is as surprised as you are; a bad share link looks the same. */}
      <EmptyState
        pose="surprised"
        headingLevel="h1"
        eyebrow={t('notFound.title')}
        title={t('notFound.message')}
        description={t('notFound.description')}
        action={(
          // An in-app link: no full reload through the startup shell, and signed-in users stay in the app.
          <Button asChild>
            <Link to={home}>{t('notFound.link')}</Link>
          </Button>
        )}
      />
    </PublicPageShell>
  );
};

export default NotFound;
