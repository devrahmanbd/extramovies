import React from "react";

export function AdminLayout({ email, csrfToken, current = "", children }: { email: string; csrfToken: string; current?: string; children: React.ReactNode }) {
  const [busy, setBusy] = React.useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/admin/logout", {
      method: "POST",
      headers: { "x-csrf-token": csrfToken },
    });
    window.location.href = "/admin/login";
  }

  const nav = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/reviews", label: "Reviews" },
    { href: "/admin/reviews/new", label: "New Review" },
    { href: "/admin/settings", label: "Settings" },
  ];

  return (
    <div className="admin-shell">
      <header className="admin-top">
        <strong>Extramovies · Admin</strong>
        <nav>
          {nav.map((n) => (
            <a key={n.href} href={n.href} className={current === n.href ? "active" : ""}>{n.label}</a>
          ))}
        </nav>
        <span className="muted">{email}</span>
        <button type="button" className="btn ghost" onClick={logout} disabled={busy}>Logout</button>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
