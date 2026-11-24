export type ActorSource = 'telegram' | 'web';

/**
 * Who is asking. `isAdmin` is lazy because the Telegram check is a network
 * call that is only needed when a room restricts a control to admins.
 */
export type Actor = {
    userRef: string;
    displayName: string;
    source: ActorSource;
    isAdmin(): Promise<boolean>;
};

/** Controls that a room can enable, disable or restrict to admins. */
export type ControlName =
    | 'next'
    | 'previous'
    | 'radio'
    | 'refresh'
    | 'mute'
    | 'unmute'
    | 'volume';

/** Outcome of asking whether an actor may use a control right now. */
export type ControlAccess = 'ok' | 'disabled' | 'admin-only';
