export const encodeRoomID = (roomID: string): string =>
    Buffer.from(roomID).toString('base64');

export const decodeRoomID = (roomID: string): string =>
    Buffer.from(roomID, 'base64').toString();

export const formatDuration = (duration: number): string => {
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const escapeHtml = (value: string | number | null | undefined): string =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

export const htmlBold = (value: string | number): string =>
    `<b>${escapeHtml(value)}</b>`;

export const htmlItalic = (value: string | number): string =>
    `<i>${escapeHtml(value)}</i>`;

export const htmlCode = (value: string | number): string =>
    `<code>${escapeHtml(value)}</code>`;

export const htmlCodeBlock = (value: string | number): string =>
    `<pre><code>${escapeHtml(value)}</code></pre>`;

export const formatDateTime = (value: Date): string =>
    value.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
