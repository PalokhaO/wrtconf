export type Serializable =
    null | string | number |
    {[key: string]: Serializable} | Serializable[];

export interface SignallingPeer {
    id: string;
    meta: Serializable;
}
