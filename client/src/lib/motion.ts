export const EASE_STANDARD = [0.2, 0, 0, 1] as const;

export const DURATION_FAST = 0.15;
export const DURATION_BASE = 0.2;

export const SPRING_CRISP = {
  type: "spring" as const,
  stiffness: 450,
  damping: 35,
  bounce: 0.05,
};

export const TRANSITION_FAST = {
  duration: DURATION_FAST,
  ease: EASE_STANDARD,
} as const;

export const TRANSITION_BASE = {
  duration: DURATION_BASE,
  ease: EASE_STANDARD,
} as const;

export const FADE_UP_FAST = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
  transition: TRANSITION_FAST,
} as const;

export const COLLAPSIBLE_PANEL = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
  transition: TRANSITION_BASE,
} as const;

export const FLOATING_BAR = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 16, scale: 0.98 },
  transition: { duration: 0.18, ease: EASE_STANDARD },
} as const;
