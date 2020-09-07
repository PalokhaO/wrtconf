export class EventEmitter<M extends EventMap> {
    private handlers: Handlers<M> = {};

    addEventListener<T extends keyof M>(eventType: T, handler: Handler<T, M>) {
        this.handlers[eventType] = [
            ...this.handlers[eventType] || [],
            handler,
        ];
    }

    removeEventListener<T extends keyof M>(eventType: T, handler: Handler<T, M>) {
        this.handlers[eventType] = this.handlers[eventType]
            ?.filter(h => h !== handler);
    }

    emit<T extends keyof M>(event: Event<T, M[T]>) {
        this.handlers[event.type]
            ?.forEach(handler => handler(event));
    }
}

interface Event<T, D> {
    type: T;
    data: D;
}

type Handler<T extends keyof M, M> = (e: Event<T, M[T]>) => void;

type Handlers<M> = {
    [T in keyof M]?: Handler<T, M>[];
};

type EventMap = {
    [T in string]: any;
};