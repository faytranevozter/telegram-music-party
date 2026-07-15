export interface Song {
    videoId: string;
    name: string;
    artist: {
        artistId: string | null;
        name: string;
    };
    duration: number;
}

export interface InlineChatLocation {
    chatId: string;
    threadId: number | null;
}
