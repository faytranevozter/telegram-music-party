export function telegramUserRef(id: number | string): string {
    return `telegram:${id}`;
}

export function telegramIdFromUserRef(ref: string): string | null {
    return /^telegram:([1-9][0-9]*)$/.exec(ref)?.[1] ?? null;
}
