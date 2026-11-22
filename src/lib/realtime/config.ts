/**
 * The BE's STOMP endpoint (`/ws`), e.g. `wss://api.example.com/ws`. `NEXT_PUBLIC_*`: inlined into the client bundle
 * when the app is BUILT, so it must be set where the build runs. Unset → no socket; the chat keeps polling.
 */
export const REALTIME_WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "";
