export type Serializable =
    null | string | number |
    {[key: string]: Serializable} | Serializable[];

export interface SignallingPeer {
    id: string;
    meta: Serializable;
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