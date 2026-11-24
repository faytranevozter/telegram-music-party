/** Serialize read/decide/write operations for a room in one backend process. */
export class RoomLock {
    private readonly pending = new Map<string, Promise<void>>();

    async run<T>(roomId: string, work: () => Promise<T>): Promise<T> {
        const previous = this.pending.get(roomId);
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        this.pending.set(roomId, current);
        await previous;
        try {
            return await work();
        } finally {
            release();
            if (this.pending.get(roomId) === current)
                this.pending.delete(roomId);
        }
    }
}
