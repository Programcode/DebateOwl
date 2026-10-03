import type { ReactNode } from "react";

export type RouteSkeletonVariant =
  | "public"
  | "home-grid"
  | "tool-form"
  | "chat"
  | "settings/list"
  | "admin/table";

type ShapeProps = {
  className: string;
};

const Shape = ({ className }: ShapeProps) => (
  <span aria-hidden="true" data-route-skeleton-shape className={`route-skeleton-shape block ${className}`} />
);

const PageFrame = ({ children, className }: { children: ReactNode; className: string }) => (
  <div className={`container w-full px-4 py-8 ${className}`}>{children}</div>
);

const Surface = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`route-skeleton-surface rounded-lg border p-6 ${className}`}>{children}</div>
);

const Heading = ({ width = "w-48" }: { width?: string }) => (
  <div className="mb-8 space-y-3">
    <Shape className={`h-9 ${width}`} />
    <Shape className="h-4 w-64 max-w-full" />
  </div>
);

const PublicSkeleton = () => (
  <PageFrame className="mx-auto max-w-5xl">
    <div className="min-h-[72vh] space-y-8">
      <div className="space-y-4 pt-8 text-center">
        <Shape className="mx-auto h-12 w-3/4 max-w-xl" />
        <Shape className="mx-auto h-5 w-full max-w-2xl" />
        <Shape className="mx-auto h-5 w-2/3 max-w-xl" />
      </div>
      <Surface className="mx-auto min-h-[360px] max-w-4xl space-y-6">
        <Shape className="h-7 w-1/2" />
        <Shape className="h-24 w-full" />
        <div className="flex flex-wrap gap-3">
          <Shape className="h-10 w-32" />
          <Shape className="h-10 w-28" />
        </div>
      </Surface>
    </div>
  </PageFrame>
);

const HomeGridSkeleton = () => (
  <PageFrame className="mx-auto max-w-5xl">
    <div className="min-h-[72vh]">
      <div className="mb-8 space-y-3 text-center">
        <Shape className="mx-auto h-10 w-64 max-w-full" />
        <Shape className="mx-auto h-4 w-44 max-w-full" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1].map((group) => (
          <Surface key={group} className="space-y-4">
            <Shape className="h-6 w-36" />
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-lg border p-3">
                <Shape className="h-9 w-9 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Shape className="h-4 w-3/4" />
                  <Shape className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </Surface>
        ))}
      </div>
      <div className="mt-8 space-y-4 border-t border-border pt-6">
        <Shape className="h-6 w-32" />
        <div className="flex flex-wrap gap-3">
          {[0, 1, 2].map((item) => <Shape key={item} className="h-10 w-28" />)}
        </div>
      </div>
    </div>
  </PageFrame>
);

const ToolFormSkeleton = () => (
  <PageFrame className="mx-auto max-w-6xl">
    <Heading width="w-52" />
    <div className="grid gap-8 lg:grid-cols-[400px_minmax(0,1fr)]">
      <Surface className="min-h-[420px] space-y-6">
        <Shape className="h-6 w-40" />
        {[0, 1, 2].map((field) => (
          <div key={field} className="space-y-2">
            <Shape className="h-4 w-28" />
            <Shape className="h-10 w-full" />
          </div>
        ))}
        <Shape className="h-10 w-32" />
      </Surface>
      <Surface className="min-h-[400px] space-y-6">
        <Shape className="h-7 w-1/2" />
        <Shape className="h-5 w-3/4" />
        <Shape className="h-32 w-full" />
        <Shape className="h-24 w-full" />
      </Surface>
    </div>
  </PageFrame>
);

const ChatSkeleton = () => (
  <PageFrame className="mx-auto max-w-5xl">
    <Heading width="w-48" />
    <Surface className="min-h-[70vh] space-y-6">
      <div className="flex items-start gap-3">
        <Shape className="h-9 w-9 shrink-0 rounded-full" />
        <Shape className="h-16 w-2/3" />
      </div>
      <div className="flex items-start justify-end gap-3">
        <Shape className="h-20 w-3/4" />
        <Shape className="h-9 w-9 shrink-0 rounded-full" />
      </div>
      <div className="flex items-start gap-3">
        <Shape className="h-9 w-9 shrink-0 rounded-full" />
        <Shape className="h-24 w-4/5" />
      </div>
      <div className="mt-auto flex gap-3 border-t border-border pt-6">
        <Shape className="h-12 min-w-0 flex-1" />
        <Shape className="h-12 w-24" />
      </div>
    </Surface>
  </PageFrame>
);

const SettingsListSkeleton = () => (
  <PageFrame className="mx-auto max-w-4xl">
    <Heading width="w-56" />
    <div className="space-y-8">
      {[0, 1, 2].map((section) => (
        <Surface key={section} className="space-y-5">
          <Shape className="h-6 w-48" />
          {[0, 1].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4 border-t border-border pt-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Shape className="h-4 w-40 max-w-full" />
                <Shape className="h-3 w-64 max-w-full" />
              </div>
              <Shape className="h-9 w-24 shrink-0" />
            </div>
          ))}
        </Surface>
      ))}
    </div>
  </PageFrame>
);

const AdminTableSkeleton = () => (
  <PageFrame className="mx-auto max-w-7xl">
    <Heading width="w-64" />
    <div className="mb-8 grid gap-4 md:grid-cols-4">
      {[0, 1, 2, 3].map((card) => (
        <Surface key={card} className="space-y-3">
          <Shape className="h-4 w-24" />
          <Shape className="h-8 w-20" />
          <Shape className="h-3 w-28" />
        </Surface>
      ))}
    </div>
    <Surface className="overflow-hidden p-0">
      <div className="grid grid-cols-4 gap-4 border-b border-border p-4">
        {[0, 1, 2, 3].map((column) => <Shape key={column} className="h-4 w-full" />)}
      </div>
      <div className="divide-y divide-border">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="grid grid-cols-4 gap-4 p-4">
            {[0, 1, 2, 3].map((column) => <Shape key={column} className="h-4 w-full" />)}
          </div>
        ))}
      </div>
    </Surface>
  </PageFrame>
);

const variants: Record<RouteSkeletonVariant, () => ReactNode> = {
  public: PublicSkeleton,
  "home-grid": HomeGridSkeleton,
  "tool-form": ToolFormSkeleton,
  chat: ChatSkeleton,
  "settings/list": SettingsListSkeleton,
  "admin/table": AdminTableSkeleton,
};

export function RouteSkeleton({
  variant,
  label,
  statusText,
}: {
  variant: RouteSkeletonVariant;
  label: string;
  statusText?: string;
}) {
  const Skeleton = variants[variant];
  const announcement = statusText ?? `Opening ${label}`;
  const BusyRegion = variant === "public" ? "main" : "div";

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" aria-label={announcement} className="sr-only">
        {announcement}
      </div>
      <BusyRegion aria-busy="true" data-route-skeleton={variant} className="min-h-[60vh] w-full">
        {Skeleton()}
      </BusyRegion>
    </>
  );
}
