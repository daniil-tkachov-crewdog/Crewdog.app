// The composer's microphone button.
//
// Press once to record, press again to stop: the clip goes to /api/transcribe
// and comes back as text, which the chat page then sends as an ordinary
// message. Nothing downstream knows a prompt was spoken.
//
// Recording is drawn live rather than faked — the bars follow the microphone's
// own amplitude through a Web Audio analyser, written straight to the DOM in a
// requestAnimationFrame loop so a 60fps waveform costs no React renders.
import React from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getAccessToken } from "@/core/supabase/client";

// A long recording is almost always a forgotten one, and the clip has to fit
// the JSON body cap on the way up. Two minutes stops both.
const MAX_MS = 120_000;
const BAR_COUNT = 4;

type Status = "idle" | "recording" | "sending";

// MediaRecorder's supported containers differ per browser: Chrome and Firefox
// give webm/opus, Safari mp4/aac. Whichever it picks, the server maps the mime
// type back to a file extension so OpenAI can decode it.
const pickMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
};

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",").pop() ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const formatElapsed = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const VoiceButton: React.FC<{
  disabled?: boolean;
  onTranscript: (text: string) => void;
}> = ({ disabled, onTranscript }) => {
  const [status, setStatus] = React.useState<Status>("idle");
  const [elapsed, setElapsed] = React.useState(0);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const barsRef = React.useRef<Array<HTMLSpanElement | null>>([]);
  // Most recent amplitudes, newest last, so the bars read as a wave travelling
  // across the button rather than four lights blinking together.
  const levelsRef = React.useRef<number[]>(new Array(BAR_COUNT).fill(0));
  // Set to true by unmount so a recorder stopping afterwards doesn't transcribe.
  const abandonedRef = React.useRef(false);

  // Releases the microphone, the analyser and both loops. Safe to call twice.
  const teardown = React.useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    recorderRef.current = null;
  }, []);

  React.useEffect(
    () => () => {
      abandonedRef.current = true;
      try {
        recorderRef.current?.stop();
      } catch {
        /* already stopped */
      }
      teardown();
    },
    [teardown]
  );

  const transcribe = React.useCallback(
    async (blob: Blob, mimeType: string) => {
      // Anything this short is a mis-click, not a sentence.
      if (blob.size < 1200) {
        setStatus("idle");
        return;
      }
      setStatus("sending");
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            audioBase64: await blobToBase64(blob),
            mimeType,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `transcribe failed: ${res.status}`);
        }
        const data = await res.json();
        const text = String(data?.text ?? "").trim();
        if (!text) throw new Error("Didn't catch any speech.");
        onTranscript(text);
      } catch (e) {
        toast.error((e as Error)?.message || "Couldn't transcribe that.");
      } finally {
        setStatus("idle");
      }
    },
    [onTranscript]
  );

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("This browser can't record audio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = (e as DOMException)?.name;
      toast.error(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was blocked. Allow it in your browser settings."
          : name === "NotFoundError"
            ? "No microphone found."
            : "Couldn't start recording."
      );
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      teardown();
      setElapsed(0);
      if (abandonedRef.current) return;
      void transcribe(blob, type);
    };

    // Live level metering. Failing here costs the animation, not the recording,
    // so it stays non-fatal.
    try {
      const Ctx =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) throw new Error("no AudioContext");
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      levelsRef.current = new Array(BAR_COUNT).fill(0);

      const draw = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const v = (samples[i] - 128) / 128;
          sum += v * v;
        }
        // RMS is small for speech, so lift it into a range the eye can read.
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 3.2);
        const levels = levelsRef.current;
        levels.push(level);
        levels.shift();
        barsRef.current.forEach((bar, i) => {
          if (bar) bar.style.transform = `scaleY(${0.22 + (levels[i] ?? 0) * 0.78})`;
        });
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);
    } catch {
      /* no analyser: the bars simply idle at their resting height */
    }

    const startedAt = Date.now();
    tickRef.current = setInterval(() => {
      const ms = Date.now() - startedAt;
      setElapsed(ms);
      if (ms >= MAX_MS) stop();
    }, 200);

    recorder.start();
    setElapsed(0);
    setStatus("recording");
  };

  const stop = () => {
    try {
      if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    } catch {
      teardown();
      setStatus("idle");
    }
  };

  if (status === "sending") {
    return (
      <div
        role="status"
        aria-label="Transcribing your recording"
        title="Transcribing…"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#E0480F] dark:text-[#FF5A1F]"
      >
        <Loader2 className="h-[18px] w-[18px] animate-spin" />
      </div>
    );
  }

  if (status === "recording") {
    return (
      <button
        onClick={stop}
        aria-label="Stop recording and send"
        title="Stop recording and send"
        className="relative flex h-9 shrink-0 animate-scale-in items-center gap-[7px] rounded-full border border-[rgba(224,72,15,0.32)] bg-[rgba(224,72,15,0.09)] pl-[10px] pr-[11px] text-[#E0480F] transition-colors duration-150 hover:bg-[rgba(224,72,15,0.16)] dark:border-[rgba(255,90,31,0.36)] dark:bg-[rgba(255,90,31,0.13)] dark:text-[#FF5A1F] dark:hover:bg-[rgba(255,90,31,0.2)]"
      >
        {/* Breathing halo, so the recording state is visible from across the
            page and not only where the cursor is. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border border-current animate-mic-halo"
        />
        <span aria-hidden className="flex h-[16px] items-center gap-[2px]">
          {Array.from({ length: BAR_COUNT }).map((_, i) => (
            <span
              key={i}
              ref={(el) => (barsRef.current[i] = el)}
              style={{ transform: "scaleY(0.22)" }}
              className="h-[16px] w-[2.5px] origin-center rounded-full bg-current transition-transform duration-75 ease-out"
            />
          ))}
        </span>
        <span className="font-mono text-[12.5px] tabular-nums">
          {formatElapsed(elapsed)}
        </span>
        <Square className="h-[11px] w-[11px] fill-current" />
      </button>
    );
  }

  return (
    <button
      onClick={start}
      disabled={disabled}
      aria-label="Record a voice message"
      title="Record a voice message"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#6E6B64] transition-[background,color,transform] duration-150 hover:bg-[rgba(26,25,23,0.06)] hover:text-[#1A1917] active:scale-95 disabled:pointer-events-none disabled:opacity-40 dark:text-[#96938C] dark:hover:bg-[rgba(255,255,255,0.07)] dark:hover:text-[#ECEBE8]"
    >
      <Mic className="h-[18px] w-[18px]" />
    </button>
  );
};

export default VoiceButton;
