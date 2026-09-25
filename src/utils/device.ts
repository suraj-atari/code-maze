export interface DeviceProfile {
  /** Show touch controls and use touch look. */
  readonly touch: boolean;
  /** Use the mobile graphics preset. */
  readonly lowPower: boolean;
}

/**
 * On phones: go fullscreen and try to lock landscape. Must run inside a user gesture.
 * Failures are expected on some browsers (e.g. iOS Safari) and are ignored — CSS shows a
 * "rotate your device" overlay in portrait instead.
 */
export function enterImmersiveMode(): void {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      return orientation.lock?.('landscape');
    })
    .catch(() => undefined);
}

/** `?touch` forces touch controls, `?low` forces the mobile graphics preset. */
export function detectDevice(params: URLSearchParams): DeviceProfile {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const touch = params.has('touch') || (coarse && navigator.maxTouchPoints > 0);
  const lowPower = params.has('low') || touch;
  return { touch, lowPower };
}
