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
      // Keep toasts clear of the home indicator and the rounded corners in the installed app.
      offset={{ bottom: "calc(24px + var(--native-safe-bottom, 0px))", right: "calc(24px + var(--native-safe-right, 0px))" }}
      mobileOffset={{ bottom: "calc(16px + var(--native-safe-bottom, 0px))" }}
      toastOptions={{
        closeButtonAriaLabel: t("common.close"),
        // Sonner's stylesheet is unlayered, so it beats Tailwind's layered utilities. The toast surface
        // needs `!`; the description and buttons have always shown Sonner's own colours.
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background! group-[.toaster]:text-foreground! group-[.toaster]:border-border! group-[.toaster]:shadow-lg!",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
      containerAriaLabel={t("common.notifications")}
    />
  );
};

export { Toaster, toast };
