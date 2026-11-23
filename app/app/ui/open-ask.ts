const OPEN_ASK = "structor-open-ask";

export function openAsk(question: string) {
  const draft = question.trim();
  if (draft) window.dispatchEvent(new CustomEvent<string>(OPEN_ASK, { detail: draft }));
}

export function onAskRequested(listener: (question: string) => void) {
  const receive = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail === "string") listener(event.detail);
  };
  window.addEventListener(OPEN_ASK, receive);
  return () => window.removeEventListener(OPEN_ASK, receive);
}
