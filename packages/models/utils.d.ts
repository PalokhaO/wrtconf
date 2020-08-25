export type Serializable =
    null | string | number |
    {[key: string]: Serializable} | Serializable[];