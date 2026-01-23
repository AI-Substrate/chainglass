import { KanbanContent } from '@/components/kanban';
import { DEMO_BOARD } from '@/data/fixtures';

/**
 * KanbanPage - Kanban board demo page
 *
 * Server component that renders the KanbanContent client component
 * with initial board data from fixtures.
 */
export default function KanbanPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Kanban Board</h1>
        <p className="text-muted-foreground mt-2">
          Drag cards between columns to update status. Use keyboard: Tab to focus, Space to pick up,
          Arrow keys to move, Space to drop.
        </p>
      </div>

      <KanbanContent initialBoard={DEMO_BOARD} />
    </div>
  );
}
