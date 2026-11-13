import { useState, useEffect, useMemo } from 'react';
import type { CounterTask, DayProgress } from '../utils/counterFirebase';

interface TaskCalendarProps {
  title: string;
  // One task in single mode, every calendar task in "All" mode
  tasks: CounterTask[];
  // taskId -> date -> progress
  progress: Record<string, Record<string, DayProgress>>;
  allMode: boolean;
  onMonthChange: (month: string) => void;
  onSelectDate: (taskId: string, date: string) => void;
  onBack: () => void;
  onPrevTask?: () => void;
  onNextTask?: () => void;
  onToggleAll?: () => void;
  onTitleClick?: () => void;
}

// 0..1 completion of a task on a day; indefinite tasks count as done once started
const taskScore = (task: CounterTask, dayProgress?: DayProgress): number => {
  if (!dayProgress || dayProgress.count <= 0) return 0;
  if (task.targetCount === null) return 1;
  return Math.min(dayProgress.count / task.targetCount, 1);
};

const scoreColor = (score: number): string =>
  score <= 0 ? 'transparent' : `rgba(76, 175, 80, ${0.2 + score * 0.6})`; // 0.2 to 0.8 opacity

export function TaskCalendar({
  title, tasks, progress, allMode, onMonthChange, onSelectDate, onBack, onPrevTask, onNextTask, onToggleAll, onTitleClick,
}: TaskCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [confirmDate, setConfirmDate] = useState<string | null>(null);
  const [pickDate, setPickDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  useEffect(() => {
    onMonthChange(monthStr);
  }, [monthStr, onMonthChange]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const days: (number | null)[] = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return days;
  }, [year, month]);

  const getDateString = (day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // Colour + small label for a day cell
  const getDayInfo = (day: number): { color: string; label: string | null } => {
    const dateStr = getDateString(day);
    if (!allMode) {
      const task = tasks[0];
      const dayProgress = task ? progress[task.id]?.[dateStr] : undefined;
      return {
        color: task ? scoreColor(taskScore(task, dayProgress)) : 'transparent',
        label: dayProgress ? String(dayProgress.count) : null,
      };
    }
    if (tasks.length === 0) return { color: 'transparent', label: null };
    let total = 0;
    let done = 0;
    let started = false;
    for (const task of tasks) {
      const dayProgress = progress[task.id]?.[dateStr];
      const score = taskScore(task, dayProgress);
      total += score;
      if (score >= 1) done++;
      if (dayProgress && dayProgress.count > 0) started = true;
    }
    return {
      color: scoreColor(total / tasks.length),
      label: started ? `${done}/${tasks.length}` : null,
    };
  };

  const getTodayString = () => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };

  const isToday = (day: number): boolean => {
    const today = new Date();
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
  };

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDateClick = (day: number) => {
    const dateStr = getDateString(day);
    if (allMode) {
      setPickDate(dateStr);
    } else if (isToday(day)) {
      if (tasks[0]) onSelectDate(tasks[0].id, dateStr);
    } else {
      setConfirmDate(dateStr);
    }
  };

  // Tasks for the picker: not-done first, keeping the user's order within each group
  const pickerTasks = pickDate
    ? tasks
        .map((task) => {
          const dayProgress = progress[task.id]?.[pickDate];
          return { task, count: dayProgress?.count ?? 0, done: taskScore(task, dayProgress) >= 1 };
        })
        .sort((a, b) => Number(a.done) - Number(b.done))
    : [];

  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`); // local midnight, not UTC
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="task-calendar">
      <button className="back-link" onClick={onBack}>← Tasks</button>
      <div className="calendar-header">
        {onPrevTask && (
          <button
            className={`task-switch-btn ${allMode ? 'dimmed' : ''}`}
            onClick={onPrevTask}
            aria-label={allMode ? 'Show single task' : 'Previous task'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        )}
        <h2
          className={allMode ? 'dimmed' : ''}
          onClick={onTitleClick}
          role={onTitleClick ? 'button' : undefined}
        >
          {title}
        </h2>
        {onNextTask && (
          <button
            className={`task-switch-btn ${allMode ? 'dimmed' : ''}`}
            onClick={onNextTask}
            aria-label={allMode ? 'Show single task' : 'Next task'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        )}
        {onToggleAll && (
          <button
            className={`all-tasks-btn ${allMode ? 'active' : ''}`}
            onClick={onToggleAll}
            aria-pressed={allMode}
          >
            All
          </button>
        )}
      </div>

      <div className="calendar-nav">
        <button onClick={goToPrevMonth}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <span className="month-year">{monthNames[month]} {year}</span>
        <button onClick={goToNextMonth}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

      <div className="calendar-grid">
        {dayNames.map((day) => (
          <div key={day} className="day-header">{day}</div>
        ))}
        {calendarDays.map((day, index) => (
          <div
            key={index}
            className={`day-cell ${day === null ? 'empty' : ''} ${day && isToday(day) ? 'today' : ''}`}
            style={day ? { backgroundColor: getDayInfo(day).color } : undefined}
            onClick={() => day && handleDateClick(day)}
          >
            {day && (
              <>
                <span className="day-number">{day}</span>
                {getDayInfo(day).label !== null && (
                  <span className="day-count">{getDayInfo(day).label}</span>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="calendar-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: 'rgba(76, 175, 80, 0.3)' }}></span>
          <span>Partial</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: 'rgba(76, 175, 80, 0.8)' }}></span>
          <span>Complete</span>
        </div>
      </div>

      {confirmDate && (
        <div className="finish-dialog-overlay">
          <div className="finish-dialog">
            <h3>Not Today</h3>
            <p>Do task for {formatDisplayDate(confirmDate)}?</p>
            <div className="finish-actions">
              <button className="continue-btn" onClick={() => setConfirmDate(null)}>
                Cancel
              </button>
              <button className="finish-btn" onClick={() => {
                if (tasks[0]) onSelectDate(tasks[0].id, confirmDate);
                setConfirmDate(null);
              }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {pickDate && (
        <div className="finish-dialog-overlay" onClick={() => setPickDate(null)}>
          <div className="finish-dialog task-picker" onClick={(e) => e.stopPropagation()}>
            <h3>{formatDisplayDate(pickDate)}</h3>
            <p>
              {pickDate === getTodayString() ? 'Which task to do?' : 'Not today. Which task to do?'}
            </p>
            <ul className="task-picker-list">
              {pickerTasks.map(({ task, count, done }) => (
                <li key={task.id}>
                  <button
                    className={`task-picker-item ${done ? 'done' : ''}`}
                    onClick={() => {
                      setPickDate(null);
                      onSelectDate(task.id, pickDate);
                    }}
                  >
                    <span className="task-picker-name">{task.name}</span>
                    <span className="task-picker-status">
                      {done ? '✓ ' : ''}
                      {task.targetCount === null ? count : `${count} / ${task.targetCount}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="finish-actions">
              <button className="continue-btn" onClick={() => setPickDate(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
