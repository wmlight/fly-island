import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { clamp } from "../../utils/number";
import "./MusicWaveButton.css";

export type MiniTransportProps = {
  /** False while music is switched off: the whole transport hides. */
  show: boolean;
  isAvailable: boolean;
  isPlaying: boolean;
  audioPeak: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  /** The collapsed bar keeps the long-press/drag gesture on the transport. */
  onDragDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onDragMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onDragUp?: (event: React.PointerEvent<HTMLDivElement>) => void;
  labelPlayPause: string;
  labelPrevious: string;
  labelNext: string;
};

/** The collapsed island's music slot: previous / play-pause (with the wave) / next. */
export function MusicMiniTransport({
  show,
  isAvailable,
  isPlaying,
  audioPeak,
  canPrevious,
  canNext,
  onPrevious,
  onPlayPause,
  onNext,
  onDragDown,
  onDragMove,
  onDragUp,
  labelPlayPause,
  labelPrevious,
  labelNext,
}: MiniTransportProps) {
  if (!show) return null;
  return (
    <div
      className="music-mini-transport"
      onPointerDown={onDragDown}
      onPointerMove={onDragMove}
      onPointerUp={onDragUp}
      onPointerCancel={onDragUp}
    >
      <button className="music-mini-transport__step" type="button" aria-label={labelPrevious} disabled={canPrevious === false && isAvailable} onClick={(event) => { event.stopPropagation(); onPrevious(); }}>
        <SkipBack size={16} strokeWidth={1.6} fill="currentColor" />
      </button>
      <MusicWaveButton
        isAvailable={isAvailable}
        isPlaying={isPlaying}
        audioPeak={audioPeak}
        label={labelPlayPause}
        onClick={onPlayPause}
        playPauseIcon={isPlaying ? <Pause size={17} strokeWidth={1.6} fill="currentColor" /> : <Play size={17} strokeWidth={1.6} fill="currentColor" className="music-mini-transport__play" />}
      />
      <button className="music-mini-transport__step" type="button" aria-label={labelNext} disabled={canNext === false && isAvailable} onClick={(event) => { event.stopPropagation(); onNext(); }}>
        <SkipForward size={16} strokeWidth={1.6} fill="currentColor" />
      </button>
    </div>
  );
}

export function MusicWaveButton({
  isAvailable,
  isPlaying,
  audioPeak,
  label,
  onClick,
  playPauseIcon = null,
}: {
  isAvailable: boolean;
  isPlaying: boolean;
  audioPeak: number;
  label: string;
  onClick: () => void;
  /** When set, the wave bars are replaced by this icon and the button toggles playback. */
  playPauseIcon?: ReactNode;
}) {
  const [phase, setPhase] = useState(0);
  const className = [
    "music-wave-button",
    isAvailable ? "music-wave-button--available" : "music-wave-button--idle",
    isPlaying ? "music-wave-button--playing" : "music-wave-button--paused",
  ]
    .filter(Boolean)
    .join(" ");
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Only playing music moves the bars. A paused player used to keep them breathing, which
  // repainted the collapsed island several times a second for nothing.
  const shouldAnimate = isPlaying && !prefersReducedMotion && playPauseIcon === null;

  useEffect(() => {
    if (!shouldAnimate) {
      setPhase(0);
      return;
    }

    // 10 frames a second; the bars' 100ms CSS transition fills in between.
    const interval = window.setInterval(() => setPhase(performance.now() / 260), 100);
    return () => window.clearInterval(interval);
  }, [shouldAnimate]);

  const liftedPeak = isPlaying
    ? clamp(Math.log1p(clamp(audioPeak, 0, 1) * 150) / Math.log1p(150), 0, 1)
    : 0;
  const barScales = [0.34, 0.72, 0.48, 0.86, 0.42].map((bar, index) => {
    const floor = isAvailable ? 0.22 : 0.12;
    const breath = shouldAnimate ? 0.07 + Math.sin(phase + index * 0.82) * 0.045 : 0;
    const movement =
      liftedPeak *
      (0.26 + bar * 1.02) *
      (0.82 + Math.sin(phase * (1.15 + index * 0.08) + index * 1.7) * 0.24);

    return clamp(floor + breath + movement, 0.12, 1.22);
  });

  return (
    <button
      className={className}
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {playPauseIcon !== null ? (
        <span className="music-mini-transport__icon">{playPauseIcon}</span>
      ) : barScales.map((scale, index) => (
        <span
          key={index}
          className="music-wave-button__bar"
          style={
            {
              "--wave-scale": scale.toFixed(3),
              "--wave-opacity": (0.42 + scale * 0.52).toFixed(3),
            } as CSSProperties
          }
        />
      ))}
    </button>
  );
}
