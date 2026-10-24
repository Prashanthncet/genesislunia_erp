"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { Button, Icon, IconButton, ToastHost } from "@/components/ui";
import { routeTagline, useRouteMeta } from "@/components/RouteMeta";
import { NotificationStackPopover, recentCount, type Notice } from "@/components/NotificationStackPopover";
import { CommandPalette } from "@/components/motion/CommandPalette";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { apiFetch } from "@/lib/api";
import { R, ROLE, ROLE_LABEL, clearSession, hasRole, isPortal, useMe } from "@/lib/auth";
import { canAccess, findNavItem, homeFor, navFor } from "@/lib/nav";

type PortalOverview = {
  children: {
    id: string;
    full_name: string;
    messages: { id: string; channel: string; subject: string | null; body: string; ref_type: string | null; status: string; created_at: string }[];
  }[];
};

/**
 * Logout confirmation used everywhere a "Log out" button lives (user menu, mobile drawer,
 * Settings). Navy theme via the app's own button classes; focus starts on "Stay" and
 * Escape / backdrop click cancel. Resolves true only when the user confirms.
 */
export async function confirmLogout(): Promise<boolean> {
  const res = await Swal.fire({
    title: "Log out?",
    text: "You'll need to sign in again to continue.",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Log out",
    cancelButtonText: "Stay",
    focusCancel: true,
    reverseButtons: true,
    allowEscapeKey: true,
    allowOutsideClick: true,
    buttonsStyling: false,
    iconColor: "var(--color-brand-700)",
    customClass: {
      popup: "!rounded-panel !border !border-line !bg-surface !shadow-pop",
      title: "!font-display !text-[20px] !font-bold !text-ink",
      htmlContainer: "!text-[13.5px] !text-ink-2",
      actions: "!gap-2",
      confirmButton: "btn-primary",
      cancelButton: "btn-soft",
    },
  });
  return res.isConfirmed;
}

/** Shown while the session/role resolves or a redirect is pending — never the page itself. */
function ShellStatus({ text }: { text: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <span className="h-1 w-40 overflow-hidden rounded-full bg-line-strong">
        <span
          className="block h-full w-1/3 rounded-full bg-brand-500"
          style={{ animation: "loader-sweep 1.1s var(--ease-smooth) infinite" }}
        />
      </span>
      <p className="text-[13px] font-medium text-ink-3">{text}</p>
    </div>
  );
}

/** Rendered INSTEAD of the page when the signed-in role may not open this URL. */
function AccessDenied({ role, home }: { role: string; home: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center" role="alert">
      <span className="grid h-14 w-14 place-items-center rounded-xl bg-danger-soft text-danger">
        <Icon name="lock" className="h-6 w-6" />
      </span>
      <div>
        <h1 className="font-display text-[22px] font-bold text-ink">Access denied</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
          Your role ({ROLE_LABEL[role] ?? role}) doesn&apos;t include this screen. If you need it for your
          work, ask the school administrator to change your access.
        </p>
      </div>
      <Link href={home} className="btn-primary">
        <Icon name="home" className="h-4 w-4" />
        Back to my dashboard
      </Link>
    </div>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  useRouteMeta(pathname);

  // Who is signed in comes from GET /auth/me (MeProvider) — never from localStorage.
  const { me, loading, refresh } = useMe();
  const roleKey = me?.role ?? null;
  const portal = isPortal(me);
  const role = roleKey ? ROLE_LABEL[roleKey] ?? roleKey.replace(/_/g, " ") : "";
  const groups = useMemo(() => navFor(roleKey), [roleKey]);
  const home = homeFor(roleKey);
  const allowed = canAccess(pathname, roleKey);
  const mustChange = !!me?.must_change_password && pathname !== "/account/password";

  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const apiOk: boolean | null = loading ? null : !!me;
  // Desktop-only icon rail. Persisted per browser so the choice survives reloads.
  const [collapsed, setCollapsed] = useState(false);

  const current = useMemo(() => findNavItem(pathname, roleKey), [pathname, roleKey]);
  const isDetail = !!current && pathname !== current.href && pathname.startsWith(current.href === "/" ? "/__none__" : current.href + "/")
    || pathname === "/account/password";
  const groupOfCurrent = useMemo(
    () => groups.find((g) => g.items.some((i) => i.href === current?.href))?.group,
    [groups, current],
  );

  // Route guard. A forced password change wins; portal users are sent to /portal from
  // any staff URL; staff on a forbidden URL get the "Access denied" state below.
  useEffect(() => {
    if (!me) return;
    if (mustChange) router.replace("/account/password");
    else if (portal && !allowed) router.replace("/portal");
  }, [me, mustChange, portal, allowed, router]);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("sidebar_collapsed") === "1"); } catch { /* storage blocked */ }
  }, []);

  /** One header button: collapses the rail on desktop, opens the drawer on mobile. */
  const toggleNav = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setCollapsed((prev) => {
        const next = !prev;
        try { localStorage.setItem("sidebar_collapsed", next ? "1" : "0"); } catch { /* storage blocked */ }
        return next;
      });
    } else {
      setMobileOpen(true);
    }
  };

  // Classes applied only to the desktop rail; the mobile drawer always shows labels.
  const railHide = collapsed ? "lg:hidden" : "";

  // Bell contents: the outbound log for roles that may read it, a parent's own
  // messages from the portal, nothing for everyone else (the API would 403).
  useEffect(() => {
    if (!me) return;
    if (hasRole(me, R.NOTIFICATION_LOG)) {
      apiFetch<Notice[]>("/api/notifications")
        .then((rows) => setNotices(Array.isArray(rows) ? rows : []))
        .catch(() => setNotices([]));
    } else if (me.role === ROLE.PARENT) {
      apiFetch<PortalOverview>("/api/portal/overview")
        .then((o) => setNotices(
          o.children
            .flatMap((c) => c.messages.map((m) => ({
              id: m.id, channel: m.channel, recipient: c.full_name, subject: m.subject, body: m.body,
              refType: m.ref_type, refId: null, status: m.status, createdAt: m.created_at,
            })))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        ))
        .catch(() => setNotices([]));
    } else {
      setNotices([]);
    }
  }, [me]);

  // Close the user menu on any outside click or Escape.
  useEffect(() => {
    if (!userMenu) return;
    const close = () => setUserMenu(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setUserMenu(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenu]);

  // Only a confirmed logout clears the session.
  const handleLogout = async () => {
    setUserMenu(false);
    setMobileOpen(false);
    if (!(await confirmLogout())) return;
    clearSession();
    router.push("/login");
  };

  // Portal: unread school notices badge on "Notices & messages" (GET /api/notices/unread-count,
  // built by the notices module). Any error — incl. 404 before it exists — just hides the badge.
  const [unreadNotices, setUnreadNotices] = useState<number | null>(null);
  useEffect(() => {
    if (!me || !portal) { setUnreadNotices(null); return; }
    let live = true;
    const refresh = () =>
      apiFetch<{ count: number }>("/api/notices/unread-count")
        .then((r) => { if (live) setUnreadNotices(typeof r?.count === "number" ? r.count : null); })
        .catch(() => { if (live) setUnreadNotices(null); });
    void refresh();
    // The notices page fires this after marking a notice read, so the badge drops immediately.
    window.addEventListener("notices:changed", refresh);
    return () => { live = false; window.removeEventListener("notices:changed", refresh); };
  }, [me, portal, pathname]);

  const newNotices = recentCount(notices);
  const showBell = hasRole(me, R.NOTIFICATION_LOG) || me?.role === ROLE.PARENT;
  const bellHref = portal ? "/portal/messages" : "/notifications";
  const branchName = me?.branch_name ?? "Your school";
  const onAccount = pathname.startsWith("/account");

  let content: React.ReactNode;
  if (loading) content = <ShellStatus text="Loading your account…" />;
  else if (!me) {
    content = (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center" role="alert">
        <Icon name="alert" className="h-6 w-6 text-danger" />
        <p className="text-[13.5px] text-ink-2">We couldn&apos;t load your account. Check the connection and try again.</p>
        <Button variant="primary" onClick={() => void refresh()}>
          <Icon name="refresh" className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  } else if (mustChange) content = <ShellStatus text="You need to set a new password first…" />;
  else if (portal && !allowed) content = <ShellStatus text="Taking you to your portal…" />;
  else if (!allowed) content = <AccessDenied role={me.role} home={home} />;
  else content = children;

  const menuLinks = [
    { href: "/account", icon: "user", label: "My account" },
    { href: "/account/password", icon: "lock", label: "Change password" },
    ...(canAccess("/settings", roleKey) ? [{ href: "/settings", icon: "settings", label: "Settings" }] : []),
  ];

  return (
    <ToastHost>
      <div className="flex min-h-dvh bg-page">
        {/* ── Sidebar ─────────────────────────────────────────────── */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-[45] bg-navy-950/50 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[264px] shrink-0 flex-col bg-brand-900 transition-[transform,width] duration-300 ease-soft lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 max-lg:w-[min(86vw,304px)] max-lg:pb-[var(--m-safe-bottom)] max-lg:pl-[env(safe-area-inset-left)] max-lg:pt-[var(--m-safe-top)] ${
            collapsed ? "lg:w-[76px]" : ""
          } ${mobileOpen ? "translate-x-0 shadow-pop" : "-translate-x-full"}`}
        >
          <div className={`relative flex items-center gap-3 border-b border-white/10 px-5 py-4 ${collapsed ? "lg:justify-center lg:px-0" : ""}`}>
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-white/20">
              <Image
                src="/logo.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 object-contain"
              />
            </span>
            <div className={`min-w-0 flex-1 ${railHide}`}>
              <p className="font-display text-[15px] font-bold leading-tight text-white">
                Genesis Lumia ERP
              </p>
              <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55">
                {portal ? (me?.role === ROLE.STUDENT ? "Student portal" : "Parent portal") : "Administration portal"}
              </p>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              className="grid h-8 w-8 max-lg:h-10 max-lg:w-10 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Close navigation"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>

          {/* Phones/tablets: who is signed in, one tap to the profile page. */}
          <Link
            href="/account"
            className="mx-3 mt-3 flex items-center gap-3 rounded-xl bg-white/[0.06] p-3 ring-1 ring-white/10 transition-colors active:bg-white/10 lg:hidden"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-500 text-[16px] font-bold text-white">
              {(me?.name || me?.email || role || "U").charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-semibold text-white">{me?.name || role || "User"}</span>
              <span className="block truncate text-[12px] text-white/60">{me?.email || role}</span>
            </span>
            <span className="shrink-0 text-[12px] font-semibold text-white/70">Profile</span>
          </Link>

          <nav className={`scroll-slim relative flex-1 overflow-y-auto px-3 py-4 ${collapsed ? "lg:px-2" : ""}`} aria-label="Main">
            {groups.map((group, gi) => (
              <div key={group.group} className={gi === 0 ? "" : "mt-5"}>
                <p className={`mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ${railHide}`}>
                  {group.group}
                </p>
                {collapsed && gi > 0 && <div className="mx-2 mb-2 hidden h-px bg-white/10 lg:block" aria-hidden />}
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = current?.href === item.href;
                    const count = item.href === "/portal/messages" && unreadNotices !== null
                      ? unreadNotices
                      : item.href === bellHref ? newNotices : 0;
                    const badge = count > 0 ? (count > 99 ? "99+" : count) : undefined;
                    return (
                      <li key={`${item.href}-${item.name}`}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          aria-label={item.name}
                          title={collapsed ? item.name : undefined}
                          className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-all duration-200 ${
                            collapsed ? "lg:justify-center lg:px-0" : ""
                          } ${
                            active
                              ? "bg-white/12 font-semibold text-white shadow-sm ring-1 ring-white/20 backdrop-blur-md"
                              : "font-medium text-white/70 hover:bg-white/[0.07] hover:text-white"
                          }`}
                        >
                          {active && (
                            <span
                              className="absolute left-1 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"
                              aria-hidden
                            />
                          )}
                          <Icon
                            name={item.icon}
                            className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                              active ? "text-accent-300" : "text-white/55"
                            }`}
                          />
                          <span className={`flex-1 truncate ${railHide}`}>{item.name}</span>
                          {badge !== undefined && (
                            <span aria-label={`${badge} unread`} className={`grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white shadow-sm ${
                              collapsed ? "lg:absolute lg:right-1 lg:top-0.5 lg:h-4 lg:min-w-4 lg:text-[9px]" : ""
                            }`}>
                              {badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="border-t border-white/10 px-3 py-2 lg:hidden">
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-white/75 transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              <Icon name="logout" className="h-[18px] w-[18px] shrink-0 text-white/55" />
              Log out
            </button>
          </div>

          <div className={`relative border-t border-white/10 p-3 ${collapsed ? "lg:px-2" : ""}`}>
            <div
              className={`flex items-center gap-3 rounded-lg bg-white/[0.06] p-2.5 ring-1 ring-white/10 ${collapsed ? "lg:justify-center lg:bg-transparent lg:p-1.5 lg:ring-0" : ""}`}
              title={collapsed ? `${branchName} · ${apiOk === false ? "API offline" : "Online"}` : undefined}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-white">
                <Icon name="building" className="h-4.5 w-4.5" />
              </span>
              <div className={`min-w-0 flex-1 ${railHide}`}>
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-white">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      apiOk === false ? "bg-danger" : "bg-ok"
                    } ${apiOk === false ? "" : "animate-pulse"}`}
                    aria-hidden
                  />
                  <span className="truncate">{branchName}</span>
                </p>
                <p className="mt-0.5 truncate text-[11px] font-medium text-white/55">
                  Session 2026–27 · {apiOk === false ? "API offline" : "Online"}
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main column ─────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-[64px] shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-xl sm:px-6 max-lg:h-[calc(66px+var(--m-safe-top))] max-lg:gap-2 max-lg:pt-[var(--m-safe-top)]">
            {/* No `lg:hidden` here: `.btn-ghost` is unlayered CSS, which beats Tailwind's
                layered utilities, so this button was always visible on desktop yet did nothing. */}
            <span className="contents max-lg:hidden">
              <IconButton
                name="menu"
                label={collapsed ? "Expand sidebar" : "Toggle sidebar"}
                variant="ghost"
                onClick={toggleNav}
                aria-expanded={!collapsed}
              />
            </span>

            <div className="min-w-0 flex-1">
              <div className="hidden lg:block">
                <CommandPalette role={roleKey} />
              </div>
              <div className="flex min-w-0 items-center gap-2 lg:hidden">
                {isDetail ? (
                  <button
                    type="button"
                    onClick={() => (window.history.length > 1 ? router.back() : router.push(current?.href ?? "/"))}
                    aria-label="Back"
                    className="-ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink active:bg-surface-2"
                  >
                    <Icon name="chevronLeft" className="h-5 w-5" />
                  </button>
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                    <Icon name={current?.icon ?? (onAccount ? "user" : "home")} className="h-5 w-5" />
                  </span>
                )}
                <div className="min-w-0">
                  <h1 className="truncate font-display text-[19px] font-bold leading-tight text-ink">
                    {current?.name ?? (onAccount ? "My account" : "Dashboard")}
                  </h1>
                  <p className="mt-0.5 truncate text-[11.5px] leading-tight text-ink-3">
                    {routeTagline(pathname) || (onAccount ? "Your profile and sign-in details" : "Genesis Lumia ERP")}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 max-lg:gap-1">
              <span className="contents lg:hidden">
                <CommandPalette role={roleKey} compact />
              </span>
              {showBell && (
                <NotificationStackPopover
                  items={notices}
                  href={bellHref}
                  emptyText={portal ? "No messages from the school yet." : "Nothing has been sent from this branch yet."}
                />
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setUserMenu((v) => !v); }}
                  aria-haspopup="menu"
                  aria-expanded={userMenu}
                  className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-surface-2"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-700 text-[12px] font-bold text-white">
                    {(me?.name || me?.email || role || "U").charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden text-[12px] font-semibold text-ink sm:inline">
                    {role || "User"}
                  </span>
                  <Icon name="chevronDown" className="h-3.5 w-3.5 text-ink-3" />
                </button>

                {userMenu && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 origin-top-right animate-scale-in overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="border-b border-line px-3.5 py-3">
                      <p className="truncate text-[13px] font-bold text-ink">
                        {me?.name || role || "User"}
                      </p>
                      <p className="truncate text-[11.5px] text-ink-3">
                        {me?.email || "Session active"}
                      </p>
                      <span className="badge badge-brand mt-2">{role || "User"}</span>
                    </div>
                    <div className="p-1.5">
                      {menuLinks.map((l) => (
                        <Link
                          key={l.href}
                          href={l.href}
                          role="menuitem"
                          onClick={() => setUserMenu(false)}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                        >
                          <Icon name={l.icon} className="h-4 w-4" />
                          {l.label}
                        </Link>
                      ))}
                      <button
                        onClick={() => void handleLogout()}
                        role="menuitem"
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger-soft"
                      >
                        <Icon name="logout" className="h-4 w-4" />
                        Log out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Breadcrumb — quiet orientation for deep pages. */}
          <div className="hidden items-center gap-1.5 px-4 pt-5 text-[12px] text-ink-3 sm:px-6 lg:flex">
            <span>{groupOfCurrent ?? (onAccount ? "Account" : "Overview")}</span>
            <Icon name="chevronRight" className="h-3.5 w-3.5" />
            <span className="font-semibold text-ink-2">{current?.name ?? (onAccount ? "My account" : "Dashboard")}</span>
          </div>

          <main key={pathname} className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 max-lg:!pb-[calc(var(--m-nav-h)+var(--m-safe-bottom)+1.5rem)]">
            {/* Entrance animation lives in (dashboard)/template.tsx — running it here too doubled it. */}
            <div className="mx-auto w-full max-w-[1560px]">{content}</div>
          </main>

          <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[11.5px] text-ink-3 sm:px-6 max-lg:hidden">
            <span>© {new Date().getFullYear()} Genesis Lumia ERP · {branchName}</span>
            <span>{portal ? "You only see your own family's records" : "All data is scoped to your branch"}</span>
          </footer>
        </div>

        {me && (
          <MobileBottomNav
            role={roleKey}
            groups={groups}
            activeHref={current?.href}
            badges={{
              ...(portal && unreadNotices ? { "/portal/messages": unreadNotices } : {}),
              ...(!portal && newNotices ? { [bellHref]: newNotices } : {}),
            }}
            onMore={() => setMobileOpen(true)}
            moreOpen={mobileOpen}
          />
        )}
      </div>
    </ToastHost>
  );
}
