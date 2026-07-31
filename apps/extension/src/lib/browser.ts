const DEVICE_ID_KEY = "ytmp_device_id";

export function getDeviceId(): string {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;

    const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
}
