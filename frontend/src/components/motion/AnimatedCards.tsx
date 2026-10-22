"use client";

/**
 * Animated card kit — opt-in motion layers on top of the design tokens.
 *
 * TiltCard / TiltCardItem and the beam border are hand-ported to this project's
 * token system from Spectrum UI (Apache-2.0, github.com/arihantcodes/spectrum-ui)
 * and border-beam (MIT, Jakub Antalík); framer-motion became motion/react and
 * the neutral shadcn surfaces became the Genesis card surface. SpotlightCard and
 * StaggerItem are project-native additions.
 *
 * Same motion contract as the rest of the kit: transform/opacity only, so cards
 * are complete without animation; JS-driven effects additionally bail out under
 * prefers-reduced-motion and for touch pointers.
 */

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent,
} from "react";
import {
  animate, motion, useMotionTemplate, useMotionValue, useReducedMotion,
  useSpring, useTransform,
} from "motion/react";

/* ── Tilt card ──────────────────────────────────────────────────── */

export interface TiltCardProps {
  children: ReactNode;
  /** Maximum rotation toward the pointer in degrees. Default 12 */
  maxTilt?: number;
  /** Invert the tilt so the card leans away from the pointer. Default false */
  tiltReverse?: boolean;
  /** Scale applied while hovered. Default 1.02 */
  scale?: number;
  /** CSS perspective distance in pixels. Default 1000 */
  perspective?: number;
  /** Show the pointer-following glare highlight. Default true */
  glare?: boolean;
  /** Color at the centre of the glare gradient */
  glareColor?: string;
  /** Classes for the outer perspective wrapper (becomes the grid item) */
  containerClassName?: string;
  /** Classes for the card surface */
  className?: string;
}

export interface TiltCardItemProps {
  children: ReactNode;
  /** Lift toward the viewer in pixels while the card is hovered. Default 0 */
  depth?: number;
  className?: string;
}

/** Stiff spring while the pointer tracks across the card. */
const TRACK_SPRING = { type: "spring", stiffness: 260, damping: 22, mass: 0.6 } as const;
/** Softer spring so the card settles gently back to rest on pointer leave. */
const RESET_SPRING = { type: "spring", stiffness: 140, damping: 18, mass: 1 } as const;
const REST_POINT = 0.5;
const PRESS_SCALE = 0.99;

const TiltCardContext = createContext<{ hovered: boolean }>({ hovered: false });

export function TiltCard({
  children, maxTilt = 12, tiltReverse = false, scale = 1.02, perspective = 1000,
  glare = true, glareColor = "rgba(255, 255, 255, 0.35)",
  containerClassName = "", className = "",
}: TiltCardProps) {
  const shouldReduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  // Smoothed normalised pointer position, animated toward each sample with
  // TRACK_SPRING and back to rest with the softer RESET_SPRING.
  const tiltX = useMotionValue(REST_POINT);
  const tiltY = useMotionValue(REST_POINT);
  const cardScale = useSpring(1, TRACK_SPRING);

  const tiltSign = tiltReverse ? -1 : 1;
  const rotateX = useTransform(tiltY, [0, 1], [maxTilt * tiltSign, -maxTilt * tiltSign]);
  const rotateY = useTransform(tiltX, [0, 1], [-maxTilt * tiltSign, maxTilt * tiltSign]);
  const glarePosX = useTransform(tiltX, (v) => v * 100);
  const glarePosY = useTransform(tiltY, (v) => v * 100);
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glarePosX}% ${glarePosY}%, ${glareColor}, transparent 65%)`;

  // Stop any in-flight tilt animations if the card unmounts mid-gesture.
  useEffect(() => () => { tiltX.stop(); tiltY.stop(); }, [tiltX, tiltY]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || shouldReduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    animate(tiltX, (event.clientX - rect.left) / rect.width, TRACK_SPRING);
    animate(tiltY, (event.clientY - rect.top) / rect.height, TRACK_SPRING);
  }, [tiltX, tiltY, shouldReduceMotion]);

  const handlePointerEnter = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || shouldReduceMotion) return;
    setHovered(true);
    cardScale.set(scale);
  }, [cardScale, scale, shouldReduceMotion]);

  const handlePointerLeave = useCallback(() => {
    setHovered(false);
    cardScale.set(1);
    animate(tiltX, REST_POINT, RESET_SPRING);
    animate(tiltY, REST_POINT, RESET_SPRING);
  }, [cardScale, tiltX, tiltY]);

  const handlePointerDown = useCallback(() => {
    if (shouldReduceMotion) return;
    cardScale.set(PRESS_SCALE);
  }, [cardScale, shouldReduceMotion]);

  const handlePointerUp = useCallback(() => {
    cardScale.set(hovered ? scale : 1);
  }, [cardScale, hovered, scale]);

  return (
    <div className={`relative ${containerClassName}`} style={{ perspective: `${perspective}px` }}>
      <motion.div
        onPointerMove={handlePointerMove}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          rotateX: shouldReduceMotion ? 0 : rotateX,
          rotateY: shouldReduceMotion ? 0 : rotateY,
          scale: cardScale,
          transformStyle: "preserve-3d",
        }}
        className={`relative overflow-hidden rounded-xl border border-line bg-surface shadow-soft will-change-transform ${className}`}
      >
        <TiltCardContext.Provider value={{ hovered }}>
          <div style={{ transformStyle: "preserve-3d" }}>{children}</div>
        </TiltCardContext.Provider>

        {glare && !shouldReduceMotion && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ background: glareBackground, transform: "translateZ(1px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: hovered ? 1 : 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        )}
      </motion.div>
    </div>
  );
}

/** Child of TiltCard that floats toward the viewer on its own translateZ depth. */
export function TiltCardItem({ children, depth = 0, className = "" }: TiltCardItemProps) {
  const shouldReduceMotion = useReducedMotion();
  const { hovered } = useContext(TiltCardContext);
  const lifted = hovered && !shouldReduceMotion;

  return (
    <div
      className={className}
      style={{
        transform: lifted ? `translateZ(${depth}px)` : "translateZ(0px)",
        transformStyle: "preserve-3d",
        transition: "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}

/* ── Border beam ────────────────────────────────────────────────── */

export interface BorderBeamProps {
  /** Travelling square edge size in px. Default 200 */
  size?: number;
  /** Seconds per lap around the border. Default 15 */
  duration?: number;
  /** Beam border width in px. Default 1.5 */
  borderWidth?: number;
  /** Anchor point along the top edge, percent. Default 90 */
  anchor?: number;
  /** Beam gradient start — defaults to the accent blue */
  colorFrom?: string;
  /** Beam gradient end — defaults to the brand navy */
  colorTo?: string;
  /** Start offset in seconds (negative runs ahead). Default 0 */
  delay?: number;
  className?: string;
}

/**
 * Animated beam that travels the card's border. Pure CSS: the parent card sets
 * the custom properties and this layer masks a moving square to the border
 * ring. Unsupported offset-path simply shows no beam — the card border below
 * is untouched.
 */
export function BorderBeam({
  size = 200, duration = 15, borderWidth = 1.5, anchor = 90,
  colorFrom = "var(--color-accent-500)", colorTo = "var(--color-brand-700)",
  delay = 0, className = "",
}: BorderBeamProps) {
  return (
    <div
      aria-hidden="true"
      className={`border-beam ${className}`}
      style={{
        "--bb-size": size,
        "--bb-duration": duration,
        "--bb-anchor": anchor,
        "--bb-border-width": borderWidth,
        "--bb-color-from": colorFrom,
        "--bb-color-to": colorTo,
        "--bb-delay": `${delay}s`,
      } as CSSProperties}
    />
  );
}

export interface BeamCardProps {
  /** Small label above the title */
  eyebrow?: string;
  title?: string;
  description?: string;
  /** Body content rendered under the description */
  children?: ReactNode;
  /** Beam lap time in seconds. Default 15 */
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  /** Start offset in seconds. Default 0 */
  delay?: number;
  className?: string;
}

/** Card surface with an accent beam travelling its border. */
export function BeamCard({
  eyebrow, title, description, children,
  duration = 15, colorFrom, colorTo, delay = 0, className = "",
}: BeamCardProps) {
  return (
    <div className={`relative rounded-xl border border-line bg-surface shadow-soft ${className}`}>
      <BorderBeam duration={duration} colorFrom={colorFrom} colorTo={colorTo} delay={delay} />
      <div className="p-5">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{eyebrow}</p>
        )}
        {title && (
          <h3 className="mt-2 font-display text-[17px] font-semibold leading-6 tracking-tight text-ink">{title}</h3>
        )}
        {description && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{description}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  );
}

/* ── Spotlight card ─────────────────────────────────────────────── */

export interface SpotlightCardProps {
  children: ReactNode;
  /**
   * Colour of the pointer-following glow — a translucent accent tint reads
   * best on the white card surface. Default accent blue at 8%.
   */
  glow?: string;
  className?: string;
}

/**
 * Soft radial highlight that follows the pointer across an existing card
 * surface (wrap around RecordCard or any relative container). The glow is a
 * background layer only — pointer-events-none, so clicks pass straight through.
 */
export function SpotlightCard({ children, glow = "rgba(59, 130, 246, 0.08)", className = "" }: SpotlightCardProps) {
  const shouldReduceMotion = useReducedMotion();
  const [active, setActive] = useState(false);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || shouldReduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }, [shouldReduceMotion]);

  return (
    <div
      className={`relative ${className}`}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerMove}
      onPointerLeave={() => setActive(false)}
    >
      {children}
      {!shouldReduceMotion && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
          style={{ background: `radial-gradient(220px circle at var(--spot-x, 50%) var(--spot-y, 50%), ${glow}, transparent 65%)` }}
        />
      )}
    </div>
  );
}

/* ── Stagger item ───────────────────────────────────────────────── */

export interface StaggerItemProps {
  children: ReactNode;
  /** Entrance delay in ms — stagger grid children with `index * step`. */
  delay?: number;
  /** Lift distance in px. Default 14 */
  y?: number;
  className?: string;
}

/**
 * Fade + lift a single grid child into view on mount. Rendered as a plain div
 * so it can be the direct grid item — put col-span utilities on it, exactly
 * like Card/useReveal. Under reduced motion the child renders with no motion.
 */
export function StaggerItem({ children, delay = 0, y = 14, className = "" }: StaggerItemProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay / 1000, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
