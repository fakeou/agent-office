import { useEffect, useState, useCallback } from "react";

const WORD1 = "Agent";
const WORD2 = "Town";
const TYPING_SPEED = 70;
const CURSOR_BLINK_SPEED = 530;
const HOLD_DURATION = 400;
const FADE_DURATION = 300;

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [charIndex, setCharIndex] = useState(0);
  const [showCursor, setShowCursor] = useState(true);
  const [phase, setPhase] = useState<"typing" | "hold" | "fadeout" | "done">("typing");

  const stableOnComplete = useCallback(onComplete, [onComplete]);
  const fullText = WORD1 + WORD2;

  // Typing
  useEffect(() => {
    if (phase !== "typing") return;
    if (charIndex >= fullText.length) {
      setPhase("hold");
      return;
    }
    const timer = setTimeout(() => setCharIndex((i) => i + 1), TYPING_SPEED);
    return () => clearTimeout(timer);
  }, [charIndex, phase, fullText.length]);

  // Hold
  useEffect(() => {
    if (phase !== "hold") return;
    const timer = setTimeout(() => setPhase("fadeout"), HOLD_DURATION);
    return () => clearTimeout(timer);
  }, [phase]);

  // Fadeout
  useEffect(() => {
    if (phase !== "fadeout") return;
    const timer = setTimeout(() => {
      setPhase("done");
      stableOnComplete();
    }, FADE_DURATION);
    return () => clearTimeout(timer);
  }, [phase, stableOnComplete]);

  // Cursor blink
  useEffect(() => {
    const timer = setInterval(() => setShowCursor((v) => !v), CURSOR_BLINK_SPEED);
    return () => clearInterval(timer);
  }, []);

  if (phase === "done") return null;

  const typed = fullText.slice(0, charIndex);
  const word1Part = typed.slice(0, WORD1.length);
  const word2Part = typed.slice(WORD1.length);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0a0a] transition-opacity"
      style={{
        opacity: phase === "fadeout" ? 0 : 1,
        transitionDuration: `${FADE_DURATION}ms`,
      }}
    >
      <div className="flex items-center">
        <span className="mr-2 select-none font-mono text-2xl text-green-500 sm:text-3xl">
          $
        </span>
        <span className="font-mono text-2xl font-bold tracking-wider sm:text-3xl">
          <span className="text-primary">{word1Part}</span>
          <span className="text-white">{word2Part}</span>
        </span>
        <span
          className="ml-0.5 inline-block h-[1.2em] w-[3px] bg-green-500 align-middle"
          style={{ opacity: showCursor ? 1 : 0 }}
        />
      </div>
    </div>
  );
}
