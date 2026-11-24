import { useId, useState } from 'react';
import type { Control } from './api';

export const controlLabels: Record<Control, string> = {
    play: 'Play', pause: 'Pause', next: 'Next', previous: 'Previous', radio: 'Start radio',
    refresh: 'Refresh player queue', mute: 'Mute', unmute: 'Unmute',
    'volume-up': 'Volume up', 'volume-down': 'Volume down',
};

const extraControls = ['volume-down', 'volume-up', 'refresh'] as const;
const extraLabels = { 'volume-down': 'Quieter', 'volume-up': 'Louder', refresh: 'Refresh queue' };
const iconPaths = {
    radio: 'M5 16a7 7 0 0 1 0-8m14 0a7 7 0 0 1 0 8M8 14a4 4 0 0 1 0-4m8 0a4 4 0 0 1 0 4m-3-2a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
    mute: 'M11 5 6 9H3v6h3l5 4V5m4 4 6 6m0-6-6 6',
    unmute: 'M11 5 6 9H3v6h3l5 4V5m4 4a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12',
    'volume-down': 'M6 12h12',
    'volume-up': 'M6 12h12M12 6v12',
    refresh: 'M20 7v5h-5m5 0a8 8 0 1 0-2 5',
};

function PlayerIcon({ name }: { name: keyof typeof iconPaths }) {
    return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]} /></svg>;
}

const subtleButton = 'btn btn-ghost text-neutral-content hover:bg-neutral-content/10';
const disabledButton = 'disabled:opacity-40 disabled:pointer-events-auto disabled:cursor-not-allowed';

export function PlayerBar({ paused, muted = false, onControl, disabledControls = [], disabled = false }: {
    paused: boolean;
    muted?: boolean;
    onControl: (action: Control) => void;
    disabledControls?: readonly Control[];
    disabled?: boolean;
}) {
    const toggle = paused ? 'play' : 'pause';
    const [showMore, setShowMore] = useState(false);
    const muteAction = muted || (disabledControls.includes('mute') && !disabledControls.includes('unmute')) ? 'unmute' : 'mute';
    const unavailable = (action: Control) => disabled || disabledControls.includes(action);
    const moreId = useId();
    return <div className="flex flex-wrap items-start gap-2" role="group" aria-label="Playback controls">
        <div className="flex items-center gap-1">
            <button type="button" className={`${subtleButton} btn-square ${disabledButton}`} aria-label="Previous" title="Previous" disabled={unavailable('previous')} onClick={() => onControl('previous')}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-current"><path d="M6 5h2v14H6zm12 0L9 12l9 7z" /></svg>
            </button>
            <button type="button" className={`btn btn-primary btn-circle ${disabledButton}`} aria-label={controlLabels[toggle]} title={controlLabels[toggle]} disabled={unavailable(toggle)} onClick={() => onControl(toggle)}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-current"><path d={paused ? 'M8 5v14l11-7z' : 'M7 5h4v14H7zm6 0h4v14h-4z'} /></svg>
            </button>
            <button type="button" className={`${subtleButton} btn-square ${disabledButton}`} aria-label="Next" title="Next" disabled={unavailable('next')} onClick={() => onControl('next')}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-current"><path d="M16 5h2v14h-2zM6 5l9 7-9 7z" /></svg>
            </button>
        </div>
        <button type="button" className={`btn ${unavailable('radio') ? 'btn-outline disabled:border-neutral-content/30 disabled:bg-transparent disabled:text-neutral-content/70 disabled:opacity-100 disabled:pointer-events-auto disabled:cursor-not-allowed' : ''}`} disabled={unavailable('radio')} onClick={() => onControl('radio')}><PlayerIcon name="radio" /> Start radio</button>
        <button type="button" className={subtleButton} aria-expanded={showMore} aria-controls={moreId} onClick={() => setShowMore((open) => !open)}>{showMore ? 'Less' : 'More'}</button>
        <div id={moreId} className={showMore ? 'flex basis-full flex-wrap items-center gap-1 border-t border-neutral-content/20 pt-2' : 'hidden'}>
            <button type="button" className={`${subtleButton} btn-sm ${disabledButton}`} disabled={unavailable(muteAction)} onClick={() => onControl(muteAction)}><PlayerIcon name={muteAction === 'unmute' ? 'mute' : 'unmute'} /> {controlLabels[muteAction]}</button>
            {extraControls.map((action) => <button type="button" className={`${subtleButton} btn-sm ${disabledButton}`} disabled={unavailable(action)} aria-label={`${extraLabels[action]} (${controlLabels[action]})`} title={controlLabels[action]} key={action} onClick={() => onControl(action)}><PlayerIcon name={action} /> {extraLabels[action]}</button>)}
        </div>
    </div>;
}
