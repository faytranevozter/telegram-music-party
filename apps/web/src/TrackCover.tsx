import { useState } from 'react';
import { coverSources } from './track-art';

export function TrackCover({ videoId, thumbnailUrl, large }: { videoId?: string; thumbnailUrl?: string | null; large?: boolean }) {
    const [failed, setFailed] = useState<string[]>([]);
    const source = coverSources(videoId, thumbnailUrl).find((url) => !failed.includes(url));

    return <div className={`avatar avatar-placeholder shrink-0 ${large ? 'self-start sm:self-center' : ''}`} aria-hidden="true">
        <div className={`overflow-hidden rounded-lg bg-base-300 text-base-content ${large ? 'size-16 sm:size-20' : 'size-11'}`}>
            {source ? <img className="size-full object-cover" src={source} alt="" decoding="async" loading={large ? 'eager' : 'lazy'} referrerPolicy="no-referrer" onError={() => setFailed((current) => [...current, source])} /> : <span>♫</span>}
        </div>
    </div>;
}
