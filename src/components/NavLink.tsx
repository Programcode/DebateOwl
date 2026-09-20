import { NavLink as RouterNavLink, type NavLinkProps } from "react-router-dom";
import { forwardRef, type FocusEvent, type PointerEvent, type TouchEvent } from "react";
import { cn } from "@/lib/utils";
import { useRoutePrefetch } from "@/hooks/use-route-prefetch";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({
    className,
    activeClassName,
    pendingClassName,
    to,
    onPointerEnter,
    onPointerLeave,
    onFocus,
    onBlur,
    onPointerDown,
    onTouchStart,
    ...props
  }, ref) => {
    const intentHandlers = useRoutePrefetch(to);

    return (
      <RouterNavLink
        ref={ref}
        to={to}
        className={({ isActive, isPending }) =>
          cn(className, isActive && activeClassName, isPending && pendingClassName)
        }
        {...props}
        onPointerEnter={(event: PointerEvent<HTMLAnchorElement>) => {
          intentHandlers.onPointerEnter(event);
          onPointerEnter?.(event);
        }}
        onPointerLeave={(event: PointerEvent<HTMLAnchorElement>) => {
          intentHandlers.onPointerLeave(event);
          onPointerLeave?.(event);
        }}
        onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
          intentHandlers.onFocus(event);
          onFocus?.(event);
        }}
        onBlur={(event: FocusEvent<HTMLAnchorElement>) => {
          intentHandlers.onBlur(event);
          onBlur?.(event);
        }}
        onPointerDown={(event: PointerEvent<HTMLAnchorElement>) => {
          intentHandlers.onPointerDown(event);
          onPointerDown?.(event);
        }}
        onTouchStart={(event: TouchEvent<HTMLAnchorElement>) => {
          intentHandlers.onTouchStart(event);
          onTouchStart?.(event);
        }}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
