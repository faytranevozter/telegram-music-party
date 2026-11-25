export const requesterDisplayOptions = {
    hidden: 'Hidden',
    anonymous: 'Anonymous',
    name: 'Show names',
} as const;

export type RequesterDisplay = keyof typeof requesterDisplayOptions;

export function isRequesterDisplay(value: unknown): value is RequesterDisplay {
    return typeof value === 'string' && Object.hasOwn(requesterDisplayOptions, value);
}

export function snapshotRequesterName(name: string): string | null {
    return [...name.replace(/\p{Cc}/gu, '').trim()].slice(0, 80).join('') || null;
}

export function requesterLabel(mode: unknown, name: string | null | undefined): string | undefined {
    if (mode === 'anonymous') return 'Anonymous';
    if (mode === 'name') return name || undefined;
}
