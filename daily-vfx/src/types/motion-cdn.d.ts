declare module "https://cdn.jsdelivr.net/npm/motion@11.14.0/+esm" {
  type MotionKeyframes = Record<string, unknown> | Keyframe[];

  interface MotionAnimationControls {
    cancel(): void;
  }

  type MotionAnimate = (
    element: Element | HTMLElement,
    keyframes: MotionKeyframes,
    options?: Record<string, unknown>
  ) => MotionAnimationControls;

  type MotionSpring = (options: Record<string, unknown>) => (t: number) => number;

  export const animate: MotionAnimate;
  export const spring: MotionSpring;
}
