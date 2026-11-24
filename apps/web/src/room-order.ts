export function readOrder() {
    let revision = 0;
    return { begin() { const value = ++revision; return () => value === revision; }, invalidate() { revision++; } };
}
