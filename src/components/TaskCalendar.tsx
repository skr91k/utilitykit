import { useState, useEffect, useMemo } from 'react';
import type { CounterTask, DayProgress } from '../utils/counterFirebase';

interface TaskCalendarProps {
  task: CounterTask;
  progress: Record<string, DayProgress>;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
  onBack: () => void;
  onPrevTask?: () => void;
  onNextTask?: () => void;
}

export function TaskCalendar({ task, progress, onMonthChange, onSelectDate, onBack, onPrevTask, onNextTask }: TaskCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [confirmDate, setConfirmDate] = useState<string | null>(null);

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

  const getCompletionColor = (day: number): string => {
    const dateStr = getDateString(day);
    const dayProgress = progress[dateStr];

    if (!dayProgress || dayProgress.count === 0) {
      return 'transparent';
    }

    if (task.targetCount === null) {
      // Indefinite task - any count shows as completed
      return dayProgress.count > 0 ? 'rgba(76, 175, 80, 0.8)' : 'transparent';
    }

    // Calculate completion percentage
    const percentage = Math.min(dayProgress.count / task.targetCount, 1);
    const opacity = 0.2 + (percentage * 0.6); // 0.2 to 0.8 opacity
    return `rgba(76, 175, 80, ${opacity})`;
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
    if (isToday(day)) {
      onSelectDate(dateStr);
    } else {
      setConfirmDate(dateStr);
    }
  };

  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="task-calendar">
      <div className="calendar-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        {onPrevTask && (
          <button className="task-switch-btn" onClick={onPrevTask} aria-label="Previous task">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        )}
        <h2>{task.name}</h2>
        {onNextTask && (
          <button className="task-switch-btn" onClick={onNextTask} aria-label="Next task">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
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
            style={day ? { backgroundColor: getCompletionColor(day) } : undefined}
            onClick={() => day && handleDateClick(day)}
          >
            {day && (
              <>
                <span className="day-number">{day}</span>
                {progress[getDateString(day)] && (
                  <span className="day-count">{progress[getDateString(day)].count}</span>
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
                onSelectDate(confirmDate);
                setConfirmDate(null);
              }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
