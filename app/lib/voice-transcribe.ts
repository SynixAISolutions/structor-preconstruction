"use client";

// Turning voice notes into text (Danial, 4 Nov: Marcel's seven notes of 26 Oct went nine days unheard, because reading
// them meant listening to them). Whisper runs in this browser, so the recording goes nowhere and no AI credits are
// spent; the library and its speech model (about 80 MB) are downloaded once, from jsDelivr and Hugging Face, and the
// browser keeps them. In a test it read 17 s of speech in 13 s, near word for word.

const WHISPER_LIBRARY = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";
const WHISPER_MODEL = "Xenova/whisper-base.en";
const SAMPLE_RATE = 16_000;

type Recogniser = (audio: Float32Array, options: { chunk_length_s: number; stride_length_s: number }) => Promise<{ text: string }>;
let loading: Promise<Recogniser> | null = null;
const recogniser = () => loading ??= (async () => {
  const { pipeline, env } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ WHISPER_LIBRARY);
  env.allowLocalModels = false;
  return await pipeline("automatic-speech-recognition", WHISPER_MODEL, { dtype: "q8", device: "wasm" }) as Recogniser;
})().catch(error => { loading = null; throw error; });

/** A recording as Whisper reads it: one channel at 16 kHz, whatever format the browser recorded. */
async function samples(recording: ArrayBuffer): Promise<Float32Array> {
  const audio = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(recording);
  const context = new OfflineAudioContext(1, Math.ceil(audio.duration * SAMPLE_RATE), SAMPLE_RATE);
  const source = context.createBufferSource();
  source.buffer = audio;
  source.connect(context.destination);
  source.start();
  return (await context.startRendering()).getChannelData(0);
}

/** What a recording says. */
export async function transcribeRecording(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The recording could not be loaded.");
  const audio = await samples(await response.arrayBuffer());
  const stt = await recogniser();
  return (await stt(audio, { chunk_length_s: 30, stride_length_s: 5 })).text;
}
