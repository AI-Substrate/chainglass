export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Chainglass Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome to the Chainglass web interface. Use the sidebar to navigate between pages.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-2">Workflow Visualization</h2>
          <p className="text-sm text-muted-foreground">
            Interactive workflow diagrams using ReactFlow.
          </p>
        </div>

        <div className="rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-2">Kanban Board</h2>
          <p className="text-sm text-muted-foreground">
            Drag-and-drop task management with dnd-kit.
          </p>
        </div>
      </div>
    </div>
  );
}
