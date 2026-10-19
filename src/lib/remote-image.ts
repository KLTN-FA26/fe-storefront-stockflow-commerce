/**
 * Product media is served from the BE's public media host (an absolute URL we cannot list in
 * `images.remotePatterns` ahead of time), so those images skip the Next optimizer. Local assets
 * (`/logo.png`) still go through it.
 */
export const isRemoteImage = (src: string) => /^https?:\/\//i.test(src);
