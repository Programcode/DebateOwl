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
            "group toast group-[.toaster]:bg-card! group-[.toaster]:text-foreground! group-[.toaster]:border-2! group-[.toaster]:border-border! group-[.toaster]:shadow-lg! group-[.toaster]:rounded-lg! group-[.toaster]:font-sans! group-[.toaster]:gap-3!",
          title: "group-[.toast]:font-extrabold! group-[.toast]:text-heading!",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:font-semibold!",
          // On touch screens the action is 44 px tall and the close button 32 px.
          // Each kind gets its colour and its own icon, so the meaning never rests on colour.
          icon: "group-[.toast]:size-8! group-[.toast]:rounded-full! group-[.toast]:flex! group-[.toast]:items-center! group-[.toast]:justify-center! group-[.toast]:shrink-0! group-[.toast]:m-0!",
          success: "[&_[data-icon]]:bg-success-tint [&_[data-icon]]:text-success-text",
          error: "[&_[data-icon]]:bg-danger-tint [&_[data-icon]]:text-danger-text",
          warning: "[&_[data-icon]]:bg-warning-tint [&_[data-icon]]:text-warning-text",
          info: "[&_[data-icon]]:bg-brand-tint [&_[data-icon]]:text-primary",
          actionButton: "group-[.toast]:bg-brand! group-[.toast]:text-white! group-[.toast]:font-display! group-[.toast]:rounded-md! group-[.toast]:shadow-[0_3px_0_var(--do-primary-ledge)]! group-[.toast]:h-8! group-[.toast]:px-3! pointer-coarse:group-[.toast]:h-11!",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: "group-[.toast]:bg-card! group-[.toast]:text-muted-foreground! group-[.toast]:border-2! group-[.toast]:border-border! hover:group-[.toast]:text-foreground! pointer-coarse:group-[.toast]:size-8!",
        },
      }}
      {...props}
      containerAriaLabel={t("common.notifications")}
    />
  );
};

export { Toaster, toast };
