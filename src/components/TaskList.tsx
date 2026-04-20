import { useState } from 'react';
import type { CounterTask } from '../utils/counterFirebase';

interface TaskListProps {
  tasks: CounterTask[];
  loading?: boolean;
  onSelectTask: (task: CounterTask) => void;
  onAddTask: (task: Omit<CounterTask, 'id' | 'isDefault' | 'createdAt'>) => void;
  onEditTask: (taskId: string, updates: Partial<CounterTask>) => void;
  onDeleteTask: (taskId: string) => void;
}

interface TaskFormData {
  name: string;
  targetCount: string;
  countAtOnce: string;
  isIndefinite: boolean;
}

export function TaskList({ tasks, loading, onSelectTask, onAddTask, onEditTask, onDeleteTask }: TaskListProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<CounterTask | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CounterTask | null>(null);
  const [formData, setFormData] = useState<TaskFormData>({
    name: '',
    targetCount: '10',
    countAtOnce: '1',
    isIndefinite: false,
  });

  const resetForm = () => {
    setFormData({ name: '', targetCount: '10', countAtOnce: '1', isIndefinite: false });
    setShowForm(false);
    setEditingTask(null);
  };

  const handleDelete = () => {
    if (deleteConfirm) {
      onDeleteTask(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) return;

    const taskData = {
      name: formData.name.trim(),
      targetCount: formData.isIndefinite ? null : parseInt(formData.targetCount) || 10,
      countAtOnce: parseInt(formData.countAtOnce) || 1,
    };

    if (editingTask) {
      onEditTask(editingTask.id, taskData);
    } else {
      onAddTask(taskData);
    }
    resetForm();
  };

  const startEdit = (task: CounterTask) => {
    setEditingTask(task);
    setFormData({
      name: task.name,
      targetCount: task.targetCount?.toString() || '10',
      countAtOnce: task.countAtOnce.toString(),
      isIndefinite: task.targetCount === null,
    });
    setShowForm(true);
  };

  return (
    <div className="task-list">
      <div className="task-list-header">
        <h2>Tasks</h2>
        <button className="add-task-btn" onClick={() => setShowForm(true)}>+ Add Task</button>
      </div>

      {showForm && (
        <div className="task-form-overlay">
          <div className="task-form">
            <h3>{editingTask ? 'Edit Task' : 'New Task'}</h3>
            <div className="form-group">
              <label>Task Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Daily Push-ups"
              />
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.isIndefinite}
                  onChange={(e) => setFormData({ ...formData, isIndefinite: e.target.checked })}
                />
                Indefinite (no target)
              </label>
            </div>
            {!formData.isIndefinite && (
              <div className="form-group">
                <label>Target Count</label>
                <input
                  type="number"
                  value={formData.targetCount}
                  onChange={(e) => setFormData({ ...formData, targetCount: e.target.value })}
                  min="1"
                />
              </div>
            )}
            <div className="form-group">
              <label>Count at Once (increment per click)</label>
              <input
                type="number"
                value={formData.countAtOnce}
                onChange={(e) => setFormData({ ...formData, countAtOnce: e.target.value })}
                min="1"
              />
            </div>
            <div className="form-actions">
              <button className="cancel-btn" onClick={resetForm}>Cancel</button>
              <button className="save-btn" onClick={handleSubmit}>
                {editingTask ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
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
