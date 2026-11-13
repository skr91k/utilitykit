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
}

export function TaskList({ tasks, loading, onSelectTask, onAddTask, onEditTask, onDeleteTask }: TaskListProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<CounterTask | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CounterTask | null>(null);

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
        <button className="add-task-btn" onClick={() => setShowForm(true)}>+ Add Task</button>
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
        {!loading && tasks.map((task) => (
          <li key={task.id} className="task-item">
            <div className="task-info" onClick={() => onSelectTask(task)}>
              <span className="task-name">{task.name}</span>
              <span className="task-details">
                {task.targetCount === null ? 'Indefinite' : `Target: ${task.targetCount}`}
                {task.countAtOnce > 1 && ` | +${task.countAtOnce}/click`}
              </span>
            </div>
            {!task.isDefault && (
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
