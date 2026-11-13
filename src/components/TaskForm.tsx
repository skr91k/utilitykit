import { useState } from 'react';
import type { CounterTask } from '../utils/counterFirebase';

export type TaskFormValues = Pick<CounterTask, 'name' | 'targetCount' | 'countAtOnce'>;

interface TaskFormProps {
  task?: CounterTask | null; // present = editing
  onSubmit: (values: TaskFormValues) => void;
  onCancel: () => void;
}

export function TaskForm({ task, onSubmit, onCancel }: TaskFormProps) {
  const [name, setName] = useState(task?.name ?? '');
  const [targetCount, setTargetCount] = useState(task?.targetCount?.toString() ?? '10');
  const [countAtOnce, setCountAtOnce] = useState(task?.countAtOnce.toString() ?? '1');
  const [isIndefinite, setIsIndefinite] = useState(task ? task.targetCount === null : false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      targetCount: isIndefinite ? null : parseInt(targetCount) || 10,
      countAtOnce: parseInt(countAtOnce) || 1,
    });
  };

  return (
    <div className="task-form-overlay">
      <div className="task-form">
        <h3>{task ? 'Edit Task' : 'New Task'}</h3>
        <div className="form-group">
          <label>Task Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Daily Push-ups"
          />
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={isIndefinite}
              onChange={(e) => setIsIndefinite(e.target.checked)}
            />
            Indefinite (no target)
          </label>
        </div>
        {!isIndefinite && (
          <div className="form-group">
            <label>Target Count</label>
            <input
              type="number"
              value={targetCount}
              onChange={(e) => setTargetCount(e.target.value)}
              min="1"
            />
          </div>
        )}
        <div className="form-group">
          <label>Count at Once (increment per click)</label>
          <input
            type="number"
            value={countAtOnce}
            onChange={(e) => setCountAtOnce(e.target.value)}
            min="1"
          />
        </div>
        <div className="form-actions">
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
          <button className="save-btn" onClick={handleSubmit}>
            {task ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
