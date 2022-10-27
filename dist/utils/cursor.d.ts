export declare abstract class Cursor<T> {
    abstract name: string;
    abstract node: Readonly<T>;
    abstract firstChild(): boolean;
    abstract lastChild(): boolean;
    abstract parent(): boolean;
    abstract prevSibling(): boolean;
    abstract nextSibling(): boolean;
    abstract fork(): Cursor<T>;
}
