import type { VideoSearchResult } from '../platform/video-search';

export type Song = VideoSearchResult;

export interface InlineChatLocation {
    chatId: string;
    threadId: number | null;
}
