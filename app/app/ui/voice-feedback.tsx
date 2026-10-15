"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Mic, RefreshCw, Send, Square } from "lucide-react";
import { MAX_VOICE_BYTES, MAX_VOICE_SECONDS, type FeedbackPage, type VoiceFeedback } from "../../lib/voice-feedback";
import { screenLabel } from "../../lib/screens";
import { Button, Modal, Tabs } from "./shared";
import "./voice-feedback.css";

type Phase = "idle" | "requesting" | "recording" | "review" | "sending" | "sent";
type Draft = { id: string; blob: Blob; url: string; duration: number; page: FeedbackPage };
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function PageVoiceFeedback({ page, notify, onOpenPage }: {
  page: FeedbackPage; notify: (message: string) => void; onOpenPage: (message: VoiceFeedback) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("Record message");
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [target, setTarget] = useState(page);
  const [author, setAuthor] = useState("Marcel Khoury");
  const [note, setNote] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<VoiceFeedback[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const startedAt = useRef(0);
  const generation = useRef(0);
  const mounted = useRef(true);
  const draftUrl = useRef("");
  const busy = phase === "requesting" || phase === "recording" || phase === "sending";

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  }, []);
  const close = useCallback(() => {
    generation.current += 1;
    stop();
    setPhase(value => value === "requesting" ? draftUrl.current ? "review" : "idle" : value);
    setOpen(false);
  }, [stop]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      stop();
      if (draftUrl.current) URL.revokeObjectURL(draftUrl.current);
    };
  }, [stop]);
  useEffect(() => {
    if (phase !== "recording") return;
    const tick = setInterval(() => {
      const seconds = (performance.now() - startedAt.current) / 1000;
      setElapsed(Math.min(seconds, MAX_VOICE_SECONDS));
      if (seconds >= MAX_VOICE_SECONDS) stop();
    }, 250);
    return () => clearInterval(tick);
  }, [phase, stop]);
  useEffect(() => {
    if (!["requesting", "recording", "review", "sending"].includes(phase)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording is not available here. Open this page in a current Chrome, Edge or Safari browser.");
      return;
    }
    const attempt = ++generation.current;
    const context = { ...page };
    if (phase === "sent") {
      if (draftUrl.current) URL.revokeObjectURL(draftUrl.current);
      draftUrl.current = "";
      setDraft(null);
      setNote("");
    }
    setTarget(context);
    setPhase("requesting");
    let microphone: MediaStream | null = null;
    try {
      microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || attempt !== generation.current) { microphone.getTracks().forEach(track => track.stop()); return; }
      stream.current = microphone;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const active = new MediaRecorder(microphone, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64_000 });
      const id = `${Date.now()}-${crypto.randomUUID()}`;
      const chunks: Blob[] = [];
      let size = 0;
      recorder.current = active;
      active.ondataavailable = event => {
        if (!event.data.size) return;
        chunks.push(event.data);
        size += event.data.size;
        if (size >= MAX_VOICE_BYTES) stop();
      };
      active.onerror = () => { setError("Recording was interrupted. Listen to the result before sending, or record it again."); stop(); };
      active.onstop = () => {
        microphone?.getTracks().forEach(track => track.stop());
        if (!mounted.current || recorder.current !== active) return;
        const blob = new Blob(chunks, { type: active.mimeType || mimeType || chunks[0]?.type || "audio/webm" });
        if (blob.size < 16) { setPhase(draftUrl.current ? "review" : "idle"); setError("No audio was captured. Please record the message again."); return; }
        if (draftUrl.current) URL.revokeObjectURL(draftUrl.current);
        const url = URL.createObjectURL(blob);
        draftUrl.current = url;
        setDraft({ id, blob, url, page: context, duration: Math.min(MAX_VOICE_SECONDS, Math.max(.01, (performance.now() - startedAt.current) / 1000)) });
        setPhase("review");
        if (blob.size > MAX_VOICE_BYTES) setError("This message is too large to send. Download it to keep a copy, then record a shorter message.");
      };
      startedAt.current = performance.now();
      setElapsed(0);
      active.start(1000);
      setPhase("recording");
    } catch (problem) {
      microphone?.getTracks().forEach(track => track.stop());
      if (!mounted.current || attempt !== generation.current) return;
      setPhase(draftUrl.current ? "review" : "idle");
      const reason = problem instanceof DOMException ? problem.name : "";
      setError(reason === "NotAllowedError" ? "Microphone access was blocked. Allow the microphone for this site in your browser, then try again."
        : reason === "NotFoundError" ? "No microphone was found. Connect one, then try again."
        : "The microphone could not start. Check that another app is not using it, then try again.");
    }
  }

  const loadMessages = useCallback(async (next: string | null = null) => {
    setLoading(true);
    setListError("");
    try {
      const response = await fetch(`/api/feedback${next ? `?cursor=${encodeURIComponent(next)}` : ""}`, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Messages could not be loaded.");
      setMessages(previous => [...new Map((next ? [...previous, ...result.messages] : result.messages).map((message: VoiceFeedback) => [message.id, message])).values()] as VoiceFeedback[]);
      setCursor(result.cursor);
    } catch (problem) { setListError(problem instanceof Error && problem.name !== "TimeoutError" ? problem.message : "Messages could not be loaded. Please try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open && tab === "Messages") void loadMessages(); }, [open, tab, loadMessages]);

  async function send() {
    if (!draft || phase !== "review") return;
    setError("");
    setPhase("sending");
    const form = new FormData();
    form.set("details", JSON.stringify({ ...draft.page, id: draft.id, duration: draft.duration, author, note }));
    form.set("audio", draft.blob, "message");
    try {
      const response = await fetch("/api/feedback", { method: "POST", body: form, signal: AbortSignal.timeout(65_000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Your message was not sent. Please try again.");
      setPhase("sent");
      notify(`Voice message sent for ${screenLabel(draft.page.screen)}.`);
    } catch (problem) {
      setPhase("review");
      setError(problem instanceof Error && !["TimeoutError", "AbortError"].includes(problem.name) ? problem.message : "Sending timed out. Your recording is still here; please try again.");
    }
  }

  const attached = draft && ["review", "sending", "sent"].includes(phase) ? draft.page : phase === "requesting" || phase === "recording" ? target : page;
  return <>
    {!open && <button className="voice-launcher" onClick={() => { setTab("Record message"); setOpen(true); }} aria-label="Record feedback for this page"><Mic size={18}/><span>Record feedback</span></button>}
    {open && <Modal title="Page feedback" subtitle="Record what you would like changed. Your message is saved for the review team." onClose={close}>
      <div className="voice-panel">
        <Tabs tabs={["Record message", "Messages"]} value={tab} onChange={value => { if (!busy) setTab(value); }}/>
        {busy && <p className="voice-hint">{phase === "requesting" ? "Waiting for microphone access…" : phase === "recording" ? "Stop the recording before opening messages." : "Sending your message…"}</p>}
        {tab === "Record message" ? <form onSubmit={event => { event.preventDefault(); void send(); }}>
          <div className="voice-context"><strong>{screenLabel(attached.screen)}</strong><span>{attached.projectName || "Workspace"}</span></div>
          <label className="ui-field">Your name<input value={author} onChange={event => setAuthor(event.target.value)} required maxLength={120} disabled={busy}/></label>
          <div className={`voice-recorder ${phase === "recording" ? "is-recording" : ""}`}>
            {phase === "recording" ? <><span className="voice-recording-status" role="status"><span/>Recording</span><strong className="voice-clock" aria-hidden="true">{clock(elapsed)}</strong><Button onClick={stop}><Square size={15}/>Stop recording</Button></>
              : <><p>{draft && phase !== "idle" ? phase === "sent" ? "Your message has been sent." : "Listen back before sending." : "Tell us what you want changed on this page."}</p>
                {draft && ["review", "sending", "sent"].includes(phase) && <audio aria-label="Your recorded message" controls preload="metadata" src={draft.url}/>}
                <Button onClick={() => void start()} disabled={busy}><Mic size={17}/>{phase === "requesting" ? "Opening microphone…" : phase === "sent" ? "Record another message" : draft ? "Record again" : "Start recording"}</Button>
                <small>Up to 3 minutes. The page and project are attached automatically.</small></>}
          </div>
          {draft && ["review", "sending", "sent"].includes(phase) && <>
            <label className="ui-field">Optional note<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={2} disabled={busy || phase === "sent"} placeholder="Anything else to add?"/></label>
            {phase === "sent" ? <p className="voice-success" role="status"><CheckCircle2 size={17}/>Saved. You can find this recording in Messages.</p> : <div className="ui-form-actions"><a className="ui-btn" href={draft.url} download="structor-voice-message"><Download size={15}/>Download a copy</a><Button type="submit" variant="primary" disabled={phase !== "review" || draft.blob.size > MAX_VOICE_BYTES}><Send size={15}/>{phase === "sending" ? "Sending…" : "Send message"}</Button></div>}
          </>}
          {error && <p className="voice-error" role="alert">{error}</p>}
        </form> : <div className="voice-inbox">
          <div className="voice-inbox-heading"><p>Messages from every page</p><Button onClick={() => void loadMessages()} disabled={loading}><RefreshCw size={14}/>Refresh</Button></div>
          {loading && !messages.length && <p role="status">Loading messages…</p>}
          {listError && <p className="voice-error" role="alert">{listError}</p>}
          {!loading && !listError && !messages.length && <p>No messages yet. Record the first one from any page.</p>}
          {messages.map(message => <article key={message.id} className="voice-message">
            <header><div><strong>{message.pageLabel}</strong><span>{message.projectName || "Workspace"}</span></div><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></header>
            <p className="voice-author">{message.author} · {clock(message.duration)}</p>
            {message.note && <p>{message.note}</p>}
            <audio controls preload="none" aria-label={`Message from ${message.author} about ${message.pageLabel}`} src={`/api/feedback/${encodeURIComponent(message.id)}/audio`} onPlay={event => { const current = event.currentTarget; document.querySelectorAll<HTMLAudioElement>(".voice-inbox audio").forEach(audio => { if (audio !== current) audio.pause(); }); }}/>
            <footer><button type="button" className="ui-btn" onClick={() => { if (onOpenPage(message)) close(); }}>Open page</button><a className="ui-btn" href={`/api/feedback/${encodeURIComponent(message.id)}/audio?download=1`} download><Download size={14}/>Download</a></footer>
          </article>)}
          {cursor && <Button onClick={() => void loadMessages(cursor)} disabled={loading}>{loading ? "Loading…" : "Load more messages"}</Button>}
        </div>}
      </div>
    </Modal>}
  </>;
}
