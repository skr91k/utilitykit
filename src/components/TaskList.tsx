import { useState } from 'react';
import type { CounterTask } from '../utils/counterFirebase';
import { TaskForm } from './TaskForm';
import type { TaskFormValues } from './TaskForm';

interface TaskListProps {
  tasks: CounterTask[];
  loading?: boolean;
  onSelectTask: (task: CounterTask) => void;
  onAddTask: (task: Omit<CounterTask, 'id' | 'isDefault' | 'createdAt'>) => void;
  onEditTask: (taskId: string, updates: Partial<CounterTask>) => void;
  onDeleteTask: (taskId: string) => void;
  onReorderTasks: (orderedIds: string[]) => void;
}

export function TaskList({ tasks, loading, onSelectTask, onAddTask, onEditTask, onDeleteTask, onReorderTasks }: TaskListProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<CounterTask | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CounterTask | null>(null);
  // Reorder mode: draftIds is the working order of non-default tasks
  const [draftIds, setDraftIds] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const reordering = draftIds !== null;
  const defaultTasks = tasks.filter((t) => t.isDefault);
  const userTasks = tasks.filter((t) => !t.isDefault);
  const byId = new Map(userTasks.map((t) => [t.id, t]));
  const visibleTasks = reordering
    ? [...defaultTasks, ...draftIds.map((id) => byId.get(id)).filter((t): t is CounterTask => !!t)]
    : tasks;

  const startReorder = () => setDraftIds(userTasks.map((t) => t.id));

  const finishReorder = () => {
    if (draftIds && draftIds.join() !== userTasks.map((t) => t.id).join()) {
      onReorderTasks(draftIds);
    }
    setDraftIds(null);
    setDragId(null);
  };

  const moveTo = (id: string, targetId: string) => {
    setDraftIds((ids) => {
      if (!ids || id === targetId) return ids;
      const from = ids.indexOf(id);
      const to = ids.indexOf(targetId);
      if (from === -1 || to === -1) return ids;
      const next = [...ids];
      next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
  };

  const moveBy = (id: string, step: 1 | -1) => {
    setDraftIds((ids) => {
      if (!ids) return ids;
      const from = ids.indexOf(id);
      const to = from + step;
      if (from === -1 || to < 0 || to >= ids.length) return ids;
      const next = [...ids];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  // Drag via the handle (pointer events cover mouse + touch)
  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragId) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-task-id]');
    const overId = over?.dataset.taskId;
    if (overId && overId !== dragId) moveTo(dragId, overId);
  };

  const handlePointerUp = () => setDragId(null);

  const closeForm = () => {
    setShowForm(false);
    setEditingTask(null);
  };

  const handleDelete = () => {
    if (deleteConfirm) {
      onDeleteTask(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  const handleSubmit = (values: TaskFormValues) => {
    if (editingTask) {
      onEditTask(editingTask.id, values);
    } else {
      onAddTask(values);
    }
    closeForm();
  };

  const startEdit = (task: CounterTask) => {
    setEditingTask(task);
    setShowForm(true);
  };

  return (
    <div className="task-list">
      <div className="task-list-header">
        <h2>Tasks</h2>
        <div className="task-list-header-actions">
          {reordering ? (
            <button className="add-task-btn" onClick={finishReorder}>Done</button>
          ) : (
            <>
              {userTasks.length > 1 && (
                <button className="reorder-btn" onClick={startReorder}>Reorder</button>
              )}
              <button className="add-task-btn" onClick={() => setShowForm(true)}>+ Add Task</button>
            </>
          )}
        </div>
      </div>

      {showForm && (
        <TaskForm task={editingTask} onSubmit={handleSubmit} onCancel={closeForm} />
      )}

      {deleteConfirm && (
        <div className="task-form-overlay">
          <div className="task-form delete-confirm">
            <h3>Delete Task?</h3>
            <p>Are you sure you want to delete "{deleteConfirm.name}"?</p>
            <div className="form-actions">
              <button className="cancel-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="delete-confirm-btn" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <ul className="tasks">
        {loading && (
          <li className="task-item" style={{ justifyContent: 'center', color: '#888' }}>
            Loading...
          </li>
        )}
        {!loading && visibleTasks.map((task) => (
          <li
            key={task.id}
            className={`task-item ${reordering ? 'reordering' : ''} ${dragId === task.id ? 'dragging' : ''}`}
            data-task-id={reordering && !task.isDefault ? task.id : undefined}
          >
            <div className="task-info" onClick={() => !reordering && onSelectTask(task)}>
              <span className="task-name">{task.name}</span>
              <span className="task-details">
                {task.targetCount === null ? 'Indefinite' : `Target: ${task.targetCount}`}
                {task.countAtOnce > 1 && ` | +${task.countAtOnce}/click`}
              </span>
            </div>
            {reordering && !task.isDefault && (
              <div className="task-actions">
                <button className="move-btn" onClick={() => moveBy(task.id, -1)} aria-label="Move up">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 15l-6-6-6 6"/>
                  </svg>
                </button>
                <button className="move-btn" onClick={() => moveBy(task.id, 1)} aria-label="Move down">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>
                <span
                  className="drag-handle"
                  onPointerDown={(e) => handlePointerDown(e, task.id)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  aria-label="Drag to reorder"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 8h16M4 12h16M4 16h16"/>
                  </svg>
                </span>
              </div>
            )}
            {!reordering && !task.isDefault && (
              <div className="task-actions">
                <button className="edit-btn" onClick={(e) => { e.stopPropagation(); startEdit(task); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button className="delete-btn" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(task); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
