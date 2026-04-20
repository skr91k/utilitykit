import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useSEO } from '../utils/useSEO'
import { useAuth } from '../utils/useAuth'
import { TaskList } from '../components/TaskList'
import { TaskCalendar } from '../components/TaskCalendar'
import {
  fetchUserTasks,
  createTask,
  updateTask,
  deleteTask,
  fetchTaskProgress,
  updateDayProgress,
  getDayProgress,
  getDefaultTaskCount,
  setDefaultTaskCount,
  resetDefaultTaskCount,
  DEFAULT_TASK,
} from '../utils/counterFirebase'
import type { CounterTask, DayProgress } from '../utils/counterFirebase'
import './Counter.css'

type ViewMode = 'tasks' | 'calendar' | 'counter'

function Counter() {
  const { user, loading, login, loginAnonymous } = useAuth()

  useSEO({
    title: 'Tally Counter',
    description: 'Simple digital tally counter with customizable cooldown. Perfect for counting people, inventory, or any repetitive counting task.',
    keywords: 'counter, tally counter, click counter, people counter, digital counter, counting app',
  })

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('tasks')
  const [selectedTask, setSelectedTask] = useState<CounterTask | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>('')

  // Task data
  const [tasks, setTasks] = useState<CounterTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [progress, setProgress] = useState<Record<string, DayProgress>>({})

  // Counter state
  const [count, setCount] = useState<number | null>(null)
  const [delayMs, setDelayMs] = useState(() => {
    const savedDelay = localStorage.getItem('counter_delay')
    return savedDelay ? parseInt(savedDelay, 10) : 500
  })
  const [cooldown, setCooldown] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [finishShown, setFinishShown] = useState(false)

  // Load tasks when user logs in
  useEffect(() => {
    if (user) {
      setTasksLoading(true)
      fetchUserTasks(user.uid).then((fetchedTasks) => {
        setTasks(fetchedTasks)
        setTasksLoading(false)
      })
    }
  }, [user])

  // Persist delay
  useEffect(() => {
    localStorage.setItem('counter_delay', delayMs.toString())
  }, [delayMs])

  // Load count when entering counter mode
  useEffect(() => {
    if (viewMode === 'counter' && selectedTask && user) {
      setCount(null) // Show loading
      if (selectedTask.isDefault) {
        getDefaultTaskCount(user.uid).then(setCount)
      } else if (selectedDate) {
        getDayProgress(user.uid, selectedTask.id, selectedDate).then((prog) => {
          setCount(prog?.count || 0)
        })
      }
    }
  }, [viewMode, selectedTask, selectedDate, user])

  const playBeep = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 800
    oscillator.type = 'sine'
    gainNode.gain.value = 0.3

    oscillator.start()
    setTimeout(() => {
      oscillator.stop()
      audioContext.close()
    }, 200)
  }

  const handleIncrement = useCallback(() => {
    if (!selectedTask || !user || count === null) return

    // Start cooldown immediately
    if (delayMs > 0) {
      setCooldown(true)
      setTimeout(() => setCooldown(false), delayMs)
    }

    const increment = selectedTask.countAtOnce
    const newCount = count + increment
    setCount(newCount)

    // Save to Firestore in background (don't await)
    if (selectedTask.isDefault) {
      setDefaultTaskCount(user.uid, newCount)
    } else if (selectedDate) {
      const completed = selectedTask.targetCount !== null && newCount >= selectedTask.targetCount
      updateDayProgress(user.uid, selectedTask.id, selectedDate, newCount, completed)

      // Check if target reached (only show dialog first time)
      if (selectedTask.targetCount !== null && newCount >= selectedTask.targetCount && !finishShown) {
        playBeep()
        setShowFinishDialog(true)
        setFinishShown(true)
      }
    }
  }, [count, delayMs, selectedTask, selectedDate, user, finishShown])

  const handleInteraction = useCallback((e?: React.SyntheticEvent | KeyboardEvent) => {
    if (e && 'preventDefault' in e && e.type === 'keydown') {
      const target = e.target as HTMLElement
      if (target.tagName.toLowerCase() === 'input') return
      e.preventDefault()
    }

    if (cooldown || showFinishDialog) return
    handleIncrement()
  }, [cooldown, showFinishDialog, handleIncrement])

  // Keyboard support for spacebar
  useEffect(() => {
    if (viewMode !== 'counter') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        handleInteraction(e)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, handleInteraction])

  const handleResetClick = () => {
    if (!selectedTask) return

    if (selectedTask.isDefault) {
      // Default task: reset immediately
      handleResetConfirm()
    } else {
      // Non-default task: show confirmation
      setShowResetConfirm(true)
    }
  }

  const handleResetConfirm = async () => {
    if (!user || !selectedTask) return

    setShowResetConfirm(false)
    setCount(0)
    setCooldown(false)
    setFinishShown(false)

    if (selectedTask.isDefault) {
      await resetDefaultTaskCount(user.uid)
    } else if (selectedDate) {
      await updateDayProgress(user.uid, selectedTask.id, selectedDate, 0, false)
    }
  }

  const handleFinish = () => {
    setShowFinishDialog(false)
    playBeep()
    // Navigate back to calendar
    setViewMode('calendar')
    // Refresh progress
    if (user && selectedTask) {
      const month = selectedDate.substring(0, 7)
      fetchTaskProgress(user.uid, selectedTask.id, month).then(setProgress)
    }
  }

  const handleContinue = () => {
    setShowFinishDialog(false)
  }

  const handleSelectTask = (task: CounterTask) => {
    setSelectedTask(task)
    setFinishShown(false)
    if (task.isDefault) {
      // Default task goes directly to counter
      setViewMode('counter')
    } else {
      // Other tasks show calendar
      setViewMode('calendar')
    }
  }

  const handleAddTask = async (taskData: Omit<CounterTask, 'id' | 'isDefault' | 'createdAt'>) => {
    if (!user) return
    const newTask = await createTask(user.uid, taskData)
    setTasks([...tasks, newTask])
  }

  const handleEditTask = async (taskId: string, updates: Partial<CounterTask>) => {
    if (!user) return
    await updateTask(user.uid, taskId, updates)
    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)))
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!user) return
    await deleteTask(user.uid, taskId)
    setTasks(tasks.filter((t) => t.id !== taskId))
  }

  const handleMonthChange = async (month: string) => {
    if (!user || !selectedTask) return
    const prog = await fetchTaskProgress(user.uid, selectedTask.id, month)
    setProgress(prog)
  }

  const handleSelectDate = (date: string) => {
    setSelectedDate(date)
    setViewMode('counter')
    setFinishShown(false)
  }

  const handleBackFromCounter = () => {
    if (selectedTask?.isDefault) {
      // Default task: go back to task list, clear everything
      setViewMode('tasks')
      setSelectedTask(null)
      setSelectedDate('')
      setCount(0)
    } else {
      // Non-default task: go back to calendar, keep selectedTask
      // Refresh progress
      if (user && selectedTask && selectedDate) {
        const month = selectedDate.substring(0, 7)
        fetchTaskProgress(user.uid, selectedTask.id, month).then(setProgress)
      }
      setViewMode('calendar')
      setSelectedDate('')
      setCount(0)
    }
  }

  const handleBackFromCalendar = () => {
    setViewMode('tasks')
    setSelectedTask(null)
    setProgress({})
  }

  if (loading) {
    return (
      <div className="counter-page">
        <Link to="/" className="back-link">← Back</Link>
        <div className="counter-circle">
          <span className="counter-value" style={{ fontSize: '2rem' }}>...</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="counter-page">
        <Link to="/" className="back-link">← Back</Link>
        <div className="login-prompt">
          <h2>Login Required</h2>
          <p>Please login to use the counter</p>
          <div className="login-buttons">
            <button onClick={login} className="google-login-btn">
              <svg viewBox="0 0 24 24" width="20" height="20" style={{ marginRight: '10px' }}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google
            </button>
            <button onClick={loginAnonymous} className="google-login-btn">
              Guest
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Task List View
  if (viewMode === 'tasks') {
    return (
      <div className="counter-page">
        <Link to="/" className="back-link">← Back</Link>
        <TaskList
          tasks={tasksLoading ? [] : [DEFAULT_TASK, ...tasks]}
          loading={tasksLoading}
          onSelectTask={handleSelectTask}
          onAddTask={handleAddTask}
          onEditTask={handleEditTask}
          onDeleteTask={handleDeleteTask}
        />
      </div>
    )
  }

  // Calendar View
  if (viewMode === 'calendar' && selectedTask) {
    return (
      <div className="counter-page">
        <Link to="/" className="back-link">← Home</Link>
        <TaskCalendar
          task={selectedTask}
          progress={progress}
          onMonthChange={handleMonthChange}
          onSelectDate={handleSelectDate}
          onBack={handleBackFromCalendar}
        />
      </div>
    )
  }

  // Counter View
  const targetText = count === null
    ? '...'
    : selectedTask?.targetCount
      ? `${count} / ${selectedTask.targetCount}`
      : count.toString()

  // Dynamic text sizing based on length
  const getSizeClass = (text: string) => {
    if (text.length >= 9) return 'size-small'
    if (text.length >= 5) return 'size-medium'
    return 'size-large'
  }

  return (
    <div className="counter-page">
      <button className="back-link" onClick={handleBackFromCounter}>← {selectedTask?.name}</button>

      <div className="top-right-controls">
        <button
          className="icon-btn"
          onClick={() => setShowSettings(!showSettings)}
          aria-label="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button className="reset-btn" onClick={handleResetClick}>
          Reset
        </button>
      </div>

      {showSettings && (
        <div className="settings-panel">
          <div className="settings-header">
            <h3>Settings</h3>
            <button className="close-btn" onClick={() => setShowSettings(false)}>x</button>
          </div>
          <div className="setting-item">
            <label htmlFor="delay-slider">
              Click Delay (0-2s) to prevent double clicks: <strong>{(delayMs / 1000).toFixed(1)}s</strong>
            </label>
            <input
              id="delay-slider"
              type="range"
              min="0"
              max="2000"
              step="100"
              value={delayMs}
              onChange={(e) => setDelayMs(parseInt(e.target.value, 10))}
            />
          </div>
          <div className="setting-item helper-text">
            * Keyboard users: Press [Space] to act as click.
          </div>
        </div>
      )}

      {showFinishDialog && (
        <div className="finish-dialog-overlay">
          <div className="finish-dialog">
            <h3>Target Reached!</h3>
            <p>You've completed {count} / {selectedTask?.targetCount}</p>
            <div className="finish-actions">
              <button className="continue-btn" onClick={handleContinue}>
                Continue
              </button>
              <button className="finish-btn" onClick={handleFinish}>
                Finish
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="finish-dialog-overlay">
          <div className="finish-dialog">
            <h3>Reset Count?</h3>
            <p>This will reset today's count to 0</p>
            <div className="finish-actions">
              <button className="continue-btn" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </button>
              <button className="delete-confirm-btn" onClick={handleResetConfirm}>
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`counter-circle ${cooldown ? 'cooldown' : ''}`}
        onClick={(e) => handleInteraction(e)}
      >
        <span className={`counter-value ${getSizeClass(targetText)}`}>{targetText}</span>
      </div>
    </div>
  )
}

export default Counter
