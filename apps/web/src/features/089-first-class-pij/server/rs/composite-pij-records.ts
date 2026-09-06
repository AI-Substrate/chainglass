import type {
  IPijRecords,
  PijListRow,
  PijNodeDetail,
  PijReadOptions,
  PijStateReport,
  PijTree,
  PijTreeScope,
} from '../pij-records.interface';
import type { RsPijRecords } from './rs-pij-records';

export function createCompositePijRecords(deps: {
  rs: RsPijRecords;
  cli: IPijRecords;
}): IPijRecords {
  return {
    list(options?: PijReadOptions): Promise<PijListRow[]> {
      return deps.rs.list(options);
    },
    state(id: string, options?: PijReadOptions): Promise<PijStateReport> {
      return deps.rs.state(id, options);
    },
    tree(options: PijTreeScope): Promise<PijTree> {
      return deps.cli.tree(options);
    },
    nodeShow(id: string, options?: PijReadOptions): Promise<PijNodeDetail> {
      return deps.cli.nodeShow(id, options);
    },
    raw(args: readonly string[], options?: PijReadOptions): Promise<unknown> {
      return deps.cli.raw(args, options);
    },
  };
}
