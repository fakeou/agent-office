# Mobile Live Recovery And Notifications Design

## Context

AgentOffice currently treats browser and mobile clients as real-time consumers of session state over WebSocket. That model works reasonably on desktop web, but it breaks down on packaged mobile apps when the app is backgrounded and then restored.

The current mobile target is Capacitor on Android, with iOS compatibility considered in the design. The product goals for this work are:

- return to a live office view quickly after the app returns to foreground
- return to a live terminal view quickly after the terminal screen returns to foreground
- deliver background notifications for exactly three worker events:
  - worker completed work and returned to idle
  - worker requires approval
  - worker requires attention

This design intentionally keeps the current React + Capacitor app architecture unless a later phase demonstrates that the WebView shell is the wrong long-term constraint.

## Problem Summary

### 1. Mobile foreground restore trusts zombie sockets

The office session socket and terminal socket both attempt a foreground reconnect today, but each path first checks whether the current socket is still `OPEN`.

That assumption is unsafe on mobile. After background suspension, the JavaScript object may still report `OPEN` while the underlying network path has already died. In that state the app believes it is still connected and does not trigger a fast reconnect.

### 2. The browser/mobile client has no liveness model

The Relay upstream tunnel already has heartbeat handling, but the mobile-facing WebSocket clients do not track:

- `lastMessageAt`
- read timeout
- stale-on-resume detection
- forced validation after app resume

This means the app cannot distinguish a healthy live socket from a dead-but-not-yet-closed socket.

### 3. Terminal recovery has a long serial startup path

The terminal screen does not become live immediately after WebSocket open. Recovery currently depends on:

1. getting a WebSocket auth token
2. opening the terminal WebSocket
3. laying out xterm
4. sending resize
5. server-side snapshot and tmux attach

That chain makes foreground recovery slower and more fragile than the office overview.

### 4. Background notifications are being asked to come from the wrong channel

A WebSocket is a foreground real-time channel. It is not a reliable background notification mechanism on Android or iOS, especially through a WebView container.

As long as the system tries to use the live transport as the background alert transport, notifications will remain unreliable by design.

### 5. There is no normalized event contract for notifications

The session model already exposes normalized display states, but there is no explicit backend event layer for:

- completion to idle
- approval requested
- attention requested

Without explicit event semantics, any notification pipeline would have to infer meaning from raw state changes and would be fragile.

## Goals

- Recover office live status within about 1 second after app foreground on a healthy network.
- Recover terminal live status within about 1 to 2 seconds after app foreground on a healthy network.
- Deliver background notifications for the three scoped worker events.
- Keep the web app and Capacitor app on the same backend state and event contract.
- Keep the design compatible with a future iOS build without depending on unsupported long-running background sockets.

## Non-Goals

- Perfectly persistent background live sockets on Android or iOS.
- Full mobile framework migration in this phase.
- Offline display of last-known worker state as a product requirement.
- Push notifications for every state transition or every provider-specific event.
- Rich notification actions in the first phase.

## Design Overview

The design splits the current single real-time path into two independent channels:

1. `Live Channel`
   - used only while the app is in foreground
   - optimized for fast recovery and session/terminal freshness
2. `Notify Channel`
   - used for background delivery of important worker events
   - implemented through native push notifications and optional web notification channels

The key principle is:

- WebSocket is for foreground live interaction.
- Notifications are for background awareness.

Do not ask one mechanism to solve both jobs.

## Detailed Design

### A. Live Supervisor

Introduce a mobile-oriented connection supervisor in `apps/app` that owns foreground recovery for both:

- office session events
- terminal stream connections

The supervisor is responsible for:

- tracking app lifecycle
- tracking network availability
- forcing stale socket replacement on foreground restore
- coordinating snapshot fetch plus WebSocket restore
- exposing connection phases to the UI

Suggested connection phases:

- `background`
- `resuming`
- `connecting`
- `live`
- `stale`
- `offline`

This state machine replaces the current approach where each screen performs isolated reconnect logic.

### B. Foreground Recovery Rules

On app foreground:

1. mark the connection as `resuming`
2. do not trust any existing socket solely because its `readyState` is `OPEN`
3. close the old socket
4. fetch a fresh lightweight snapshot
5. open a fresh WebSocket
6. require either an `open + first message` success or a short timeout
7. if no message arrives within the timeout window, mark the connection `stale` and reconnect again

Suggested timing:

- snapshot timeout: 1.5 to 2 seconds
- first-message timeout after socket open: 1 to 2 seconds
- reconnect retry after stale detection: immediate first retry, then bounded backoff

This avoids waiting for the platform to eventually notice that an old socket is dead.

### C. Office Live Channel

The office screen should use a lightweight recovery flow:

- fetch current session summary over HTTP on foreground
- render that summary immediately
- reconnect the events WebSocket in parallel
- transition to `live` only after receiving current event traffic

Important behavior changes:

- foreground recovery must force a new connection even if the old socket still appears open
- network recovery events should trigger reconnect immediately
- the UI should show `resuming` or `reconnecting`, not silently remain in a false live state

This keeps the office view responsive without requiring offline state persistence as a product guarantee.

### D. Terminal Live Channel

The terminal needs a stricter recovery path than the office overview.

Recommended flow:

1. on foreground, always replace the terminal socket
2. reconnect with fresh auth material when needed
3. immediately request a terminal snapshot
4. start tmux attach without waiting for a later client resize event
5. once layout stabilizes, send resize updates normally

Server-side change:

- tmux terminal streaming should not be blocked on the first resize message
- if the client has not yet sent dimensions, start with the most recent known dimensions or a safe default

This changes terminal restore from a long serial chain to a two-stage restore:

- stage 1: show snapshot quickly
- stage 2: attach live stream

That is the right user experience target for mobile resume.

### E. Liveness Detection

Both live sockets need client-side freshness tracking.

Suggested metadata per socket:

- `connectedAt`
- `lastMessageAt`
- `lastOpenAt`
- `resumeAttemptCount`

Required logic:

- when the app resumes, if the socket has not received data within a short window, treat it as stale
- if the network becomes available after being offline, trigger immediate reconnect
- if auth refresh fails, surface an auth-specific error instead of leaving the client in reconnect churn

This is not a protocol-level heartbeat requirement, although a lightweight app-level ping/pong can be added later. The essential change is that the client must own freshness detection.

### F. Notification Broker

Add a backend notification broker that consumes normalized worker events and dispatches background notifications.

Responsibilities:

- subscribe to worker event output
- filter only the three scoped notification event types
- deduplicate events
- rate-limit repeated notifications
- dispatch to device-specific channels

Scoped events:

- `worker.task.completed_to_idle`
- `worker.approval.requested`
- `worker.attention.requested`

Notification transport by platform:

- Android/iOS: push notifications
- Web foreground: in-app banner/toast
- Web background: optional future Web Push

The broker must operate independently of the live WebSocket channel.

### G. Worker Event Contract

Do not derive notification meaning directly from arbitrary provider logs or UI fields. Introduce a normalized backend event layer.

Suggested normalized events:

- `worker.task.completed_to_idle`
  - emitted when a worker was previously doing work and has now reached idle because the task completed
- `worker.approval.requested`
  - emitted when the worker newly enters approval state
- `worker.attention.requested`
  - emitted when the worker newly enters attention state

Suggested event payload:

- `userId`
- `sessionId`
- `provider`
- `title`
- `eventType`
- `state`
- `displayState`
- `displayZone`
- `turnId`
- `reason`
- `timestamp`

Mapping guidance:

- completion to idle must be backed by an actual completion signal, not a generic transition to idle
- approval and attention events should only emit on edge transitions, not continuously while the worker remains in that state

### H. Deduplication And Rate Limits

Notifications must be deduplicated or the app will become noisy immediately.

Suggested dedupe key:

- `userId + sessionId + eventType + turnId`

Fallback when no `turnId` exists:

- `userId + sessionId + eventType + stateEnteredAt`

Suggested behavior:

- one notification per edge transition
- suppress duplicate notifications for the same event within a bounded TTL
- allow a later transition back into the same state to notify again when it represents a genuinely new event

### I. Device Registry

Add a device registry to support push delivery.

Suggested stored fields:

- `deviceId`
- `userId`
- `platform`
- `pushToken`
- `lastSeenAt`
- `appVersion`
- `notificationsEnabled`
- per-event preferences if needed later

Suggested endpoints:

- `POST /api/push/register-device`
- `DELETE /api/push/devices/:deviceId`
- `GET /api/push/preferences`
- `POST /api/push/preferences`

The initial notification preference model can remain simple:

- completed-to-idle enabled
- approval enabled
- attention enabled

### J. Why Capacitor Still Fits

Capacitor remains the recommended first path because it can support:

- app lifecycle hooks
- network availability hooks
- push notification integration
- local/native notification display

The current problem is architectural, not primarily framework choice.

React Native or Flutter may become attractive later if the mobile app grows into a much more native-heavy product, but neither changes the need for:

- foreground live recovery discipline
- normalized worker events
- a real notification backend

Changing framework now would add migration cost without removing the fundamental need for those systems.

### K. iOS Considerations

The design must assume stricter background behavior on iOS.

Important consequence:

- do not define success as “keep the WebSocket alive in background”
- define success as “recover fast on foreground” and “deliver background notifications via push”

This is the only design stance that remains credible across both Android and iOS.

## Alternatives Considered

### Alternative 1: Keep WebSocket-only architecture and improve retry timing

Rejected because it cannot provide reliable background notifications and still depends on mobile WebView socket behavior.

### Alternative 2: Immediate migration to React Native

Deferred. React Native could improve native control, but it would not eliminate the need for a separate notification pipeline or a normalized worker event layer.

### Alternative 3: Immediate migration to Flutter

Deferred for the same reasons, with even less code reuse from the current React app.

## Risks

- Notification dedupe rules may initially under-notify or over-notify if event identity is too weak.
- Terminal resume may still feel slow if the tmux attach path itself is slow under relay conditions.
- Android vendors can still aggressively kill background app behavior, so push delivery remains necessary even if live recovery improves.
- Web Push support may lag behind mobile push if introduced later.

## Rollout Plan

### Phase 1: Fast Foreground Live Recovery

- introduce live supervisor
- add stale-on-resume logic
- add network-aware reconnect triggers
- split office recovery into snapshot first, WebSocket second
- change terminal restore to snapshot plus immediate attach

Success criteria:

- office returns to live quickly after foreground
- terminal returns to live quickly after foreground
- the client no longer remains trapped on a zombie socket

### Phase 2: Notification Infrastructure

- add worker event normalizer
- add notification broker
- add device registration and notification preferences
- send Android/iOS notifications for the three scoped worker events

Success criteria:

- approval, attention, and completed-to-idle notifications arrive in background
- duplicates are suppressed reliably

### Phase 3: Product Refinement

- add notification quieting and preference tuning
- add deep links from notifications to office/terminal views
- evaluate whether the Capacitor shell remains sufficient after these foundations are in place

## Follow-Up Work Outside This Spec

- Push provider selection and operational rollout details
- Optional web push support
- Cross-device unread notification center
- Broader mobile UX refinement after live recovery is stabilized
