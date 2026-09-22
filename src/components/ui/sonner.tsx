/* eslint-disable react-refresh/only-export-components */
import { useTranslation } from "react-i18next";
import { Toaster as Sonner, toast } from "sonner";
import { useSettingsStore } from "@/lib/stores/settings-store";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useSettingsStore((state) => state.theme);
  const { t } = useTranslation();

  return (
    <Sonner
      theme={theme}
      closeButton
      className="toaster group"
      toastOptions={{
        closeButtonAriaLabel: t("common.close"),
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
