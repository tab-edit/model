import { Extension } from "@codemirror/state";
import { TabModel } from "./model";
export declare class TabModelSupport {
    readonly tabModel: TabModel;
    readonly support: Extension;
    extension: Extension;
    constructor(tabModel: TabModel, support?: Extension);
}
