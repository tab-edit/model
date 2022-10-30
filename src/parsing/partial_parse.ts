import { Fragment } from "../structures/fragment";
import { TabTree } from "../structures/tree";

export abstract class PartialTabParse<F extends Fragment = Fragment> {

    protected fragments: F[] = [];
    getFragments() { this.fragments }
    

    private _stoppedAt: number|null = null;
    /// Reports whether `stopAt` has been called on this parse.
    get stoppedAt() { return this._stoppedAt }
    
    /// Tell the parse to not advance beyond the given position.
    /// `advance` will return a tree when the parse has reached the
    /// position. Note that, depending on the parser algorithm and the
    /// state of the parse when `stopAt` was called, that tree may
    /// contain nodes beyond the position. It is not allowed to call
    /// `stopAt` a second time with a higher position.
    stopAt(pos: number) {
        if (this.stoppedAt !== null && this.stoppedAt < pos) throw new RangeError("Can't move stoppedAt forward");
        this._stoppedAt = pos;
    }
    
    /// The position up to which the document has been parsed.
    abstract parsedPos: number;


    /// This parser is dependent on another parser.
    /// parameters:
    ///     * catchupTimeout - if the dependent parser has not caught up, do not do more than this amount of work to catch it up
    /// returns {blocked:boolean, tree:TabTree|null}
    ///     * blocked - is this parser blocked waiting for the other parser it is dependent on?
    ///     * tree - the TabTree when the parse completes and null otherwise
    abstract advance(catchupTimeout?: number, catchupDistance?: number): {blocked:boolean, tree: TabTree<F>|null};
}
