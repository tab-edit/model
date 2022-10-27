import { ChangeDesc, EditorState, Facet, Transaction } from "@codemirror/state";
import { ChangedRange } from "@lezer/common";
import { TabModel } from "../extension/model";
import { TabTree } from "../structures/tree";
import { Fragment } from "../structures/fragment";
import { PartialTabParse } from "../parsing/partial_parse";
import { TabParser } from "../parsing/parser";

type ParseCtxConstructor<T extends TabParseContext> = new(...args: ConstructorParameters<typeof TabParseContext>) => T

export abstract class TabParseContext {
    private parse: PartialTabParse = null;
    /// @internal
    tempSkipped: {from: number, to: number}[] = [];

    /// @internal
    constructor(
        private parser: TabParser,
        /// The current editor state.
        readonly state: EditorState,
        /// Tree fragments that can be reused by incremental re-parses
        public fragments: readonly Fragment[] = [],
        /// @internal
        public tree: TabTree,
        public treeLen: number,
        /// The current editor viewport (or some overapproximation
        /// thereof). Intended to be used for opportunistically avoiding
        /// work (in which case
        /// [`skipUntilInView`](#model.ParseContext.skipUntilInView)
        /// should be called to make sure the parser is restarted when the
        /// skipped region becomes visible).
        public viewport: {from: number, to: number},
        /// @internal
        public skipped: {from: number, to:number}[],
        /// This is where skipping parsers can register a promise that,
        /// when resolved, will schedule a new parse. It is cleared when
        /// the parse worker picks up the promise. @internal
        public scheduleOn: Promise<unknown> | null
    ) {}

    abstract get currentContext(): TabParseContext;
    abstract set currentContext(ctx: TabParseContext);

    private startParse() {
        return this.parser.startParse(this.state, this.fragments);
    }

    static init<T extends TabParseContext>(
        ParseContextType: ParseCtxConstructor<T>,
        state: EditorState,
        modelFacet: Facet<TabModel, TabModel>
    ): T {
        let vpTo = Math.min(Work.InitViewport, state.doc.length);
        let parseState = new ParseContextType(state.facet(modelFacet)!.parser, state, [],
                                            TabTree.empty, 0, {from: 0, to: vpTo}, [], null);
        if (!parseState.work(Work.Apply, vpTo)) parseState.takeTree(); // TODO: understand this line
        return parseState;
    }

    apply(tr: Transaction) {
        let newCx = this.changes(tr.changes, tr.state);
        // If the previous parse wasn't done, go forward only up to its
        // end position or the end of the viewport, to avoid slowing down
        // state updates with parse work beyond the viewport.

        //TODO spend some time to understand this correctly.
        let upto = this.treeLen === tr.startState.doc.length ? undefined
            : Math.max(tr.changes.mapPos(this.treeLen), newCx.viewport.to);
        if (!newCx.work(Work.Apply, upto)) newCx.takeTree();
        return newCx;
    }

    /// @internal
    work(time: number, upto?: number) {
        if (upto != null && upto >= this.state.doc.length) upto = undefined;
        if (this.tree !== TabTree.empty && this.isDone(upto ?? this.state.doc.length)) {
            this.takeTree();
            return true;
        }
        return this.withContext(() => {
            let endTime = Date.now() + time;
            if (!this.parse) this.parse = this.startParse();
            if (upto != null && (this.parse.stoppedAt === null || this.parse.stoppedAt > upto) &&
                upto < this.state.doc.length) this.parse.stopAt(upto);
            for(;;) {
                let {tree} = this.parse.advance();
                if (tree!==null) {
                    this.fragments = this.withoutTempSkipped(Fragment.addTree(tree, this.fragments));
                    this.treeLen = this.parse.stoppedAt ?? this.state.doc.length;
                    this.tree = tree;
                    this.parse = null;
                    // TODO: for some reason, this.parse.stoppedAt is always null when we reach the end of an incompltete tree
                    // and this prevents us from starting another parse
                    if (this.treeLen < (upto ?? this.state.doc.length))
                        this.parse = this.startParse();
                    else
                        return false;
                }
                if (Date.now() > endTime) return false;
            }
        })
    }

    /// @internal
    takeTree() {
        let pos, tree: TabTree | null | undefined;
        if (this.parse && (pos = this.parse.parsedPos) >= this.treeLen) {
            if (this.parse.stoppedAt === null || this.parse.stoppedAt > pos) this.parse.stopAt(pos);
            this.withContext(() => { while (!(tree = this.parse!.advance(Work.MinSlice).tree)) {} });
            this.treeLen = pos;
            this.tree = tree!;
            this.fragments = this.withoutTempSkipped(Fragment.addTree(this.tree, this.fragments));
            this.parse = null;
        }
    }

    private withContext<T>(f: () => T): T {
        let prev = this.currentContext;
        this.currentContext = this;
        try { return f(); }
        finally { this.currentContext = prev; }
    }

    private withoutTempSkipped(fragments: readonly Fragment[]) {
        for (let r; r = this.tempSkipped.pop();) {
            fragments = cutFragments(fragments, r.from, r.to);
        }
        return fragments;
    }


    /// @internal
    changes(changes: ChangeDesc, newState: EditorState) {
        let {fragments, tree, treeLen, viewport, skipped} = this;
        this.takeTree();
        if (!changes.empty) {
            let ranges: ChangedRange[] = [];
            changes.iterChangedRanges((fromA, toA, fromB, toB) => ranges.push({fromA, toA, fromB, toB}));
            fragments = Fragment.applyChanges(fragments, ranges);
            tree = TabTree.empty;
            treeLen = 0;

            //update viewport and the skipped positions according to the changes that are made
            viewport = {from: changes.mapPos(viewport.from, -1), to: changes.mapPos(viewport.to, 1)};
            if (this.skipped.length) {
                skipped = [];
                for (let r of this.skipped) {
                    let from = changes.mapPos(r.from, 1);
                    let to = changes.mapPos(r.to, -1);
                    if (from < to) skipped.push({from, to});
                }
            }
        }

        // create an instance of the subclass which extends this TabParseContext class
        let ParseContextType = this.constructor as ParseCtxConstructor<typeof this>
        return new ParseContextType(this.parser, newState, fragments, tree, treeLen, viewport, skipped, this.scheduleOn);
    }

    /// @internal
    updateViewport(viewport: {from: number, to: number}) {
        if (this.viewport.from === viewport.from && this.viewport.to === viewport.to) return false;
        this.viewport = viewport;
        let startLen = this.skipped.length;
        for (let i = 0; i < this.skipped.length; i++) {
            let {from, to} = this.skipped[i];
            if (from < viewport.to && to > viewport.from) {
                this.fragments = cutFragments(this.fragments, from, to); // TODO: understand this
                this.skipped.splice(i--, 1);
            }
        }
        if (this.skipped.length >= startLen) return false;
        this.reset();
        return true;
    }

    /// @internal
    reset() {
        if (this.parse) {
            this.takeTree();
            this.parse = null;
        }
    }

    /// Notify the parse scheduler that the given region was skipped
    /// because it wasn't in view, and the parse should be restarted
    /// when it comes into view.
    skipUntilInView(from: number, to: number) {
        this.skipped.push({from, to});
    }

    /// Returns a parser intended to be used as placeholder when
    /// asynchronously loading a nested parser. It'll skip its input and
    /// mark it as not-really-parsed, so that the next update will parse
    /// it again.
    ///
    /// When `until` is given, a reparse will be scheduled when that
    /// promise resolves.
    static getSkippingParser(until?: Promise<unknown>) {
        const test = new class extends TabParser<Fragment> {
            createParse(editorState: EditorState, fragments: readonly Fragment[], ranges: readonly { from: number; to: number; }[]) {
                let from = ranges[0].from, to = ranges[ranges.length - 1].to;
                let parser = {
                    parsedPos: from,
                    advance() {
                        let cx = this.currentContext;
                        if (cx) {
                            for (let r of ranges) cx.tempSkipped.push(r);
                            if (until) cx.scheduleOn = cx.scheduleOn ? Promise.all([cx.scheduleOn, until]) : until;
                        }
                        this.parsedPos = to;
                        return {blocked: false, tree: TabTree.createBlankTree(from, to)};
                    },
                    stoppedAt: null,
                    stopAt() {},
                    getFragments() { return [] }
                }
                return parser;
            }
        }
        return test;
    }

    /// @internal
    isDone(upto: number) {
        upto = Math.min(upto, this.state.doc.length);
        let frags = this.fragments;
        return this.treeLen >= upto && frags.length && frags[0].from === 0 && frags[frags.length-1].to >= upto;
    }
}

function cutFragments(fragments: readonly Fragment[], from: number, to: number) {
    return Fragment.applyChanges(fragments, [{fromA: from, toA: to, fromB: from, toB: to}]);
}