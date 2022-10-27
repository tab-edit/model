import { ChangeDesc, EditorState, Facet, Transaction } from "@codemirror/state";
import { TabModel } from "../extension/model";
import { TabTree } from "../structures/tree";
import { Fragment } from "../structures/fragment";
import { PartialTabParse } from "../parsing/partial_parse";
import { TabParser } from "../parsing/parser";
declare type ParseCtxConstructor<T extends TabParseContext> = new (...args: ConstructorParameters<typeof TabParseContext>) => T;
export declare abstract class TabParseContext {
    private parser;
    readonly state: EditorState;
    fragments: readonly Fragment[];
    tree: TabTree;
    treeLen: number;
    viewport: {
        from: number;
        to: number;
    };
    skipped: {
        from: number;
        to: number;
    }[];
    scheduleOn: Promise<unknown> | null;
    private parse;
    tempSkipped: {
        from: number;
        to: number;
    }[];
    constructor(parser: TabParser, state: EditorState, fragments: readonly Fragment[], tree: TabTree, treeLen: number, viewport: {
        from: number;
        to: number;
    }, skipped: {
        from: number;
        to: number;
    }[], scheduleOn: Promise<unknown> | null);
    abstract get currentContext(): TabParseContext;
    abstract set currentContext(ctx: TabParseContext);
    private startParse;
    static init<T extends TabParseContext>(ParseContextType: ParseCtxConstructor<T>, state: EditorState, modelFacet: Facet<TabModel, TabModel>): T;
    apply(tr: Transaction): this;
    work(time: number, upto?: number): boolean;
    takeTree(): void;
    private withContext;
    private withoutTempSkipped;
    changes(changes: ChangeDesc, newState: EditorState): this;
    updateViewport(viewport: {
        from: number;
        to: number;
    }): boolean;
    reset(): void;
    skipUntilInView(from: number, to: number): void;
    static getSkippingParser(until?: Promise<unknown>): {
        createParse(editorState: EditorState, fragments: readonly Fragment[], ranges: readonly {
            from: number;
            to: number;
        }[]): {
            parsedPos: number;
            advance(): {
                blocked: boolean;
                tree: {
                    readonly from: number;
                    readonly to: number;
                    readonly fragments: Fragment[];
                };
            };
            stoppedAt: any;
            stopAt(): void;
            getFragments(): any[];
        };
        startParse(editorState: EditorState, fragments?: readonly Fragment[], ranges?: readonly {
            from: number;
            to: number;
        }[]): PartialTabParse<Fragment>;
        parse(editorState: EditorState, fragments?: readonly Fragment[], ranges?: readonly {
            from: number;
            to: number;
        }[]): TabTree<Fragment>;
    };
    isDone(upto: number): boolean;
}
export {};
