import { Fragment } from "../structures/fragment";
import { TabTree } from "../structures/tree";
export declare abstract class PartialTabParse<F extends Fragment = Fragment> {
    protected fragments: F[];
    getFragments(): void;
    private _stoppedAt;
    get stoppedAt(): number | null;
    stopAt(pos: number): void;
    abstract parsedPos: number;
    abstract advance(catchupTimeout?: number, catchupDistance?: number): {
        blocked: boolean;
        tree: TabTree<F> | null;
    };
}
