import { Serializable } from "./utils";

export type ClientMessage = ClientMetaMessage | ClientOfferMessage |
    ClientAnswerMessage | ClientCandidateMessage;

export interface ClientMetaMessage {
    type: 'meta';
    meta: Serializable;
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

export interface ClientCandidateMessage {
    type: 'candidate';
    to: string;
    candidate: RTCIceCandidate;
}

export type ServerMessage = ServerClientsMessage | ServerOfferMessage
    | ServerAnswerMessage | ServerCandidateMessage;

export interface ServerClientsMessage {
    type: 'clients';
    clients: {id: string, meta: Serializable}[];
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

export interface ServerCandidateMessage {
    type: 'candidate';
    from: string;
    candidate: RTCIceCandidate;
}
