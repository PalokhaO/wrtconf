export interface SignallingPeer {
    id: string;
    meta: string;
}

export interface StreamConstraints {
    video?: {
        // maxBitrate?: number;
        maxFramerate?: number;
        minSize?: number;
        quality?: number;
    };
    audio?: {
        maxBitrate?: number;
    };
}