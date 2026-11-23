/* Feature fixtures are partial by design. */
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
import { authorizeControl } from './control-access';
import { Actor } from './actor';

/** Actor whose admin check is observable in assertions. */
function makeActor(isAdmin: boolean) {
    const isAdminFn = jest.fn().mockResolvedValue(isAdmin);
    const actor: Actor = {
        userRef: '7',
        displayName: 'Ana',
        source: 'telegram',
        isAdmin: isAdminFn,
    };
    return { actor, isAdminFn };
}

describe('authorizeControl', () => {
    it('allows every control in a room without a Feature row', async () => {
        const { actor } = makeActor(false);
        expect(await authorizeControl(null, 'next', actor)).toBe('ok');
    });

    it('reports a disabled control without checking admin', async () => {
        const { actor, isAdminFn } = makeActor(false);
        const access = await authorizeControl(
            { nextCommand: false, nextOnlyAdmin: true } as any,
            'next',
            actor,
        );
        expect(access).toBe('disabled');
        expect(isAdminFn).not.toHaveBeenCalled();
    });

    it('restricts an admin-only control to admins', async () => {
        const member = makeActor(false);
        const admin = makeActor(true);
        const feature = { nextCommand: true, nextOnlyAdmin: true } as any;

        expect(await authorizeControl(feature, 'next', member.actor)).toBe(
            'admin-only',
        );
        expect(await authorizeControl(feature, 'next', admin.actor)).toBe('ok');
    });

    it('does not check admin when the admin-only flag is off', async () => {
        const { actor, isAdminFn } = makeActor(false);
        const access = await authorizeControl(
            { nextCommand: true, nextOnlyAdmin: false } as any,
            'next',
            actor,
        );
        expect(access).toBe('ok');
        expect(isAdminFn).not.toHaveBeenCalled();
    });

    it.each([
        ['previous', 'previousCommand', 'previousOnlyAdmin'],
        ['radio', 'radioCommand', 'radioOnlyAdmin'],
        ['refresh', 'refreshCommand', 'refreshOnlyAdmin'],
    ] as const)(
        'applies enabled and admin-only flags for %s',
        async (control, enabled, onlyAdmin) => {
            const member = makeActor(false);
            expect(
                await authorizeControl(
                    { [enabled]: false, [onlyAdmin]: true } as any,
                    control,
                    member.actor,
                ),
            ).toBe('disabled');
            expect(
                await authorizeControl(
                    { [enabled]: true, [onlyAdmin]: true } as any,
                    control,
                    member.actor,
                ),
            ).toBe('admin-only');
            expect(
                await authorizeControl(
                    { [enabled]: true, [onlyAdmin]: false } as any,
                    control,
                    member.actor,
                ),
            ).toBe('ok');
        },
    );

    it.each([
        ['mute', 'muteCommand'],
        ['unmute', 'unmuteCommand'],
        ['volume', 'volumeCommand'],
    ] as const)(
        'applies the enabled flag for %s and never admin-only',
        async (control, enabled) => {
            const { actor } = makeActor(false);
            expect(
                await authorizeControl(
                    { [enabled]: false } as any,
                    control,
                    actor,
                ),
            ).toBe('disabled');
            expect(
                await authorizeControl(
                    { [enabled]: true } as any,
                    control,
                    actor,
                ),
            ).toBe('ok');
        },
    );
});
