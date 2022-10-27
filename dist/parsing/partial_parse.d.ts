import { Fragment } from "../structures/fragment";
import { TabTree } from "../structures/tree";
export declare abstract class PartialTabParse<F extends Fragment = Fragment> {
    abstract advance(catchupTimeout?: number, catchupDistance?: number): {
        blocked: boolean;
        tree: TabTree<F> | null;
    };
    abstract readonly parsedPos: number;
    abstract stopAt(pos: number): void;
    readonly stoppedAt: number | null;
    abstract getFragments(): Fragment[];
}