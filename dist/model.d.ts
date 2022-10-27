import { EditorState, Extension, Facet, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { TabParseWorker } from "./parse-work/parse-worker";
import { TabModelState } from "./model-state";
import { TabTree } from "./structures/tree";
import { TabParser } from "./parsing/parser";
export declare abstract class TabModel {
    readonly data: Facet<{
        [name: string]: any;
    }>;
    parser: TabParser;
    private modelPackage;
    readonly extension: Extension;
    constructor(data: Facet<{
        [name: string]: any;
    }>, parser: TabParser, modelPackage: TabModelPackage, extraExtensions?: Extension[]);
    isActiveAt(state: EditorState, pos: number, side?: -1 | 0 | 1): boolean;
}
export declare class TabModelPackage {
    readonly facet: Facet<TabModel, TabModel | null>;
    readonly viewPlugin: ViewPlugin<TabParseWorker>;
    private readonly getModelState;
    constructor(facet: Facet<TabModel, TabModel | null>, viewPlugin: ViewPlugin<TabParseWorker>, getModelState: () => StateField<TabModelState>);
    get state(): StateField<TabModelState>;
    tree(state: EditorState): TabTree<import(".").Fragment>;
    ensureTree(state: EditorState, upto: number, timeout?: number): TabTree | null;
    treeAvailable(state: EditorState, upto?: number): boolean;
    parserRunning(view: EditorView): boolean | (() => void);
    dataFacetAt(state: EditorState, pos: number, side: -1 | 0 | 1): Facet<{
        [name: string]: any;
    }, readonly {
        [name: string]: any;
    }[]>;
    static defineDataFacet(baseData?: {
        [name: string]: any;
    }): Facet<{
        [name: string]: any;
    }, readonly {
        [name: string]: any;
    }[]>;
}
