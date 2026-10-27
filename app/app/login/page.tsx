"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { afterSignIn, SESSION_DAYS } from "../../lib/demo-password";
import "./login.css";

/** The Structor sign-in page, in place of the browser's own password box (27 Oct). */
export default function SignInPage() {
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setError(body.error ?? "Sign-in didn't work. Try again."); setBusy(false); return; }
      // Back to the page that asked, with its screen (#packages) kept.
      window.location.replace(afterSignIn(new URLSearchParams(window.location.search).get("next")) + window.location.hash);
    } catch {
      setError("Structor couldn't be reached. Check your connection and try again.");
      setBusy(false);
    }
  }

  return <main className="signin">
    <section className="signin-brand" aria-hidden="true">
      <div className="signin-logo"><span className="signin-logomark"><i/><i/><i/></span><span>structor<span className="signin-dot">.</span></span></div>
      <div className="signin-pitch">
        <h2>From first drawing to final award.</h2>
        <p>Scopes, bid packages, leveling, budgets and buyout for every project, in one workspace.</p>
      </div>
      <p className="signin-foot">Preconstruction workspace</p>
    </section>
    <section className="signin-panel">
      <form className="signin-card" onSubmit={signIn} noValidate>
        <div className="signin-logo compact" aria-hidden="true"><span className="signin-logomark"><i/><i/><i/></span><span>structor<span className="signin-dot">.</span></span></div>
        <span className="signin-icon"><LockKeyhole size={20}/></span>
        <h1>Sign in</h1>
        <p className="signin-lead">Enter the workspace password to open Structor.</p>
        <label className="signin-field" htmlFor="signin-password">Password</label>
        <div className={`signin-input ${error ? "has-error" : ""}`}>
          <input id="signin-password" type={shown ? "text" : "password"} autoComplete="current-password" autoFocus value={password} onChange={event => { setPassword(event.target.value); if (error) setError(""); }} aria-invalid={!!error} aria-describedby={error ? "signin-error" : undefined} placeholder="Workspace password"/>
          <button type="button" onClick={() => setShown(value => !value)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}>{shown ? <EyeOff size={17}/> : <Eye size={17}/>}</button>
        </div>
        {error && <p id="signin-error" className="signin-error" role="alert">{error}</p>}
        <button className="signin-submit" type="submit" disabled={!password || busy}>{busy ? <><LoaderCircle size={17} className="signin-spin"/>Signing in…</> : <>Sign in<ArrowRight size={17}/></>}</button>
        <p className="signin-note">You stay signed in on this browser for {SESSION_DAYS} days.</p>
      </form>
    </section>
  </main>;
}
