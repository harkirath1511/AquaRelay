"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";
import { api, ApiError } from "./api";
import { Icon, Loading } from "./ui";
import { dateLabel, humanize } from "./data";

type AccountData = { user: { id: string; email: string }; profile: { display_name: string; role: string }; contributions: { id: string; incident_id: string; description: string; category: string; observed_at: string; incidents: { evidence_status: string; resolved_at: string | null } }[]; impact: { id: string; reason: string; created_at: string; points: number }[] };
export function AccountMenu() {
  const [identity, setIdentity] = useState<{ email?: string } | null>(null);
  useEffect(() => {
    let active = true;
    const client = browserClient();
    client.auth.getUser().then(({ data }) => { if (active) setIdentity(data.user); });
    const { data } = client.auth.onAuthStateChange((_event, session) => { if (active) setIdentity(session?.user ?? null); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return <Link className="account-link" href="/account?mode=live" title={identity?.email}>{identity ? `Account · ${identity.email?.split("@")[0]}` : "Sign in"}</Link>;
}

export function AccountPage() {
  const query = useSearchParams();
  const [flow, setFlow] = useState(query.get("flow") === "update-password" ? "update-password" : "signin");
  const [account, setAccount] = useState<AccountData | null>(null), [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState(query.get("error") ? "This sign-in link is invalid or expired. Request a new link." : ""), [busy, setBusy] = useState(false);
  async function load() {
    try { const result = await api<AccountData>("/api/me"); setAccount(result); setDisplayName(result.profile.display_name); }
    catch (e) { setAccount(null); if (!(e instanceof ApiError && e.status === 401)) setMessage(e instanceof Error ? e.message : "Account unavailable"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const client = browserClient();
      if (flow === "signup") {
        const { data, error } = await client.auth.signUp({ email, password, options: { data: { display_name: displayName.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (error) throw error;
        if (data.session) await load(); else setMessage("Check your email for the confirmation link before signing in.");
      } else if (flow === "recover") {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/account?flow=update-password")}` });
        if (error) throw error;
        setMessage("If that account exists, a recovery link will arrive by email.");
      } else if (flow === "update-password") {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setFlow("signin"); setPassword(""); setMessage("Password updated."); await load();
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setPassword(""); await load();
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : "Account request failed"); }
    finally { setBusy(false); }
  }
  if (loading) return <Loading />;
  if (account && flow !== "update-password") return <div className="content-page"><div className="page-heading"><div className="eyebrow">YOUR LIVE ACCOUNT · {account.profile.role.toUpperCase()}</div><h1>{account.profile.display_name}</h1><p>{account.user.email}</p><div className="actions"><Link className="button" href="/explore?mode=live">Explore live investigations</Link>{["reviewer", "admin"].includes(account.profile.role) && <Link className="button secondary" href="/review?mode=live">Reviewer workspace</Link>}{account.profile.role === "admin" && <Link className="button secondary" href="/admin?mode=live">Administration</Link>}<button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); const { error } = await browserClient().auth.signOut(); setBusy(false); if (error) setMessage(error.message); else { setAccount(null); setPassword(""); setMessage("You have signed out."); } }}>Sign out</button></div></div><section className="card card-body"><h2>Your details</h2><form onSubmit={async e => { e.preventDefault(); setBusy(true); try { await api("/api/me", { method: "PATCH", body: JSON.stringify({ displayName }) }); await load(); setMessage("Display name saved."); } catch (e) { setMessage(e instanceof Error ? e.message : "Profile update failed"); } finally { setBusy(false); } }}><label>Display name<input value={displayName} maxLength={80} required onChange={e => setDisplayName(e.target.value)} /></label><p>Your role is managed by an administrator and cannot be changed here.</p><button className="button" disabled={busy}>Save display name</button></form></section>{message && <p className="info-box" role="status">{message}</p>}<div className="impact-columns"><section><h2>Your contributions</h2>{account.contributions.length ? account.contributions.map(c => <article key={c.id} className="card card-body"><h3>{humanize(c.category)} · {dateLabel(c.observed_at)}</h3><p>{c.description}</p><p>{humanize(c.incidents?.evidence_status ?? "early_signal")}</p><Link className="text-link" href={`/investigations/${c.incident_id}?mode=live`}>Open investigation →</Link></article>) : <p>No contributions yet. A careful observation is a useful place to start.</p>}</section><section><h2>Evidence recognised</h2>{account.impact.length ? account.impact.map(event => <article className="card card-body" key={event.id}><p>{humanize(event.reason)}</p><small>{dateLabel(event.created_at)}</small></article>) : <p>Recognition appears when your contribution helps fill an evidence gap.</p>}</section></div></div>;
  return <section className="account-page card card-body"><Icon name="shield" size={36} /><div className="eyebrow">AQUARELAY ACCOUNT</div><h1>{flow === "signup" ? "Join your community." : flow === "recover" ? "Recover your account." : flow === "update-password" ? "Choose a new password." : "Welcome back."}</h1><form onSubmit={submit}>{flow === "signup" && <label>Display name<input required maxLength={80} value={displayName} autoComplete="name" onChange={e => setDisplayName(e.target.value)} /></label>}{flow !== "update-password" && <label>Email<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>}{flow !== "recover" && <label>Password<input required type="password" minLength={flow === "signin" ? 1 : 12} autoComplete={flow === "signin" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} />{flow !== "signin" && <small>Use at least 12 characters.</small>}</label>}{message && <p role="status" className="info-box">{message}</p>}<button className="button" disabled={busy}>{busy ? "Working…" : flow === "signup" ? "Create participant account" : flow === "recover" ? "Send recovery link" : flow === "update-password" ? "Save password" : "Sign in"}</button></form><div className="account-options">{[["signin", "Sign in"], ["signup", "Create an account"], ["recover", "Forgot password?"]].filter(([value]) => value !== flow).map(([value, label]) => <button key={value} className="text-link" onClick={() => { setFlow(value); setMessage(""); setPassword(""); }}>{label}</button>)}</div><Link className="text-link" href="/explore">Explore the labelled demo →</Link></section>;
}
