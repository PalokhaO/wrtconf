import { Serializable } from "./utils";

export type ClientMessage = ClientConnectMessage | ClientOfferMessage |
    ClientAnswerMessage | ClientMetaMessage;

export interface ClientConnectMessage {
    type: 'connect';
}

export interface ClientOfferMessage {
    type: 'offer';
    to: string;
    offer: RTCSessionDescriptionInit;
}

export interface ClientAnswerMessage {
    type: 'answer';
    to: string;
    answer: RTCSessionDescriptionInit;
}

export interface ClientMetaMessage {
    type: 'meta';
    from: string;
    meta: Serializable;
}

export type ServerMessage = ServerConnectMessage | ServerOfferMessage
    | ServerAnswerMessage | ServerMetaMessage | ServerDisconnectMessage;

export interface ServerConnectMessage {
    type: 'connect';
    from: string;
}

export interface ServerOfferMessage {
    type: 'offer';
    from: string;
    offer: RTCSessionDescriptionInit;
}

export interface ServerAnswerMessage {
    type: 'answer';
    from: string;
    answer: RTCSessionDescriptionInit;
}

export interface ServerMetaMessage {
    type: 'meta';
    from: string;
    meta: Serializable;
}

export interface ServerDisconnectMessage {
    type: 'disconnect';
    from: string;
}