import { Actor, ControlAccess, ControlName } from './actor';
import type { Feature } from '@prisma/client';

const CONTROL_FLAGS: Record<
    ControlName,
    { enabled: keyof Feature; onlyAdmin?: keyof Feature }
> = {
    next: { enabled: 'nextCommand', onlyAdmin: 'nextOnlyAdmin' },
    previous: {
        enabled: 'previousCommand',
        onlyAdmin: 'previousOnlyAdmin',
    },
    radio: { enabled: 'radioCommand', onlyAdmin: 'radioOnlyAdmin' },
    refresh: { enabled: 'refreshCommand', onlyAdmin: 'refreshOnlyAdmin' },
    mute: { enabled: 'muteCommand' },
    unmute: { enabled: 'unmuteCommand' },
    volume: { enabled: 'volumeCommand' },
};

/**
 * Decide whether `actor` may use `control` in a room with `feature`.
 *
 * A room without a Feature row has no restrictions yet, so every control is
 * allowed. The admin check runs only for controls that a room actually
 * restricts, which keeps Telegram membership lookups off the common path.
 */
export async function authorizeControl(
    feature: Feature | null,
    control: ControlName,
    actor: Actor,
): Promise<ControlAccess> {
    if (!feature) return 'ok';

    const flags = CONTROL_FLAGS[control];
    if (feature[flags.enabled] !== true) return 'disabled';

    if (flags.onlyAdmin && feature[flags.onlyAdmin] === true) {
        return (await actor.isAdmin()) ? 'ok' : 'admin-only';
    }

    return 'ok';
}
