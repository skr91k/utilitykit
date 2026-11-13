import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useSEO } from '../utils/useSEO'
import { useAuth } from '../utils/useAuth'
import { TaskList } from '../components/TaskList'
import { TaskCalendar } from '../components/TaskCalendar'
import { TaskForm } from '../components/TaskForm'
import type { TaskFormValues } from '../components/TaskForm'
import {
  fetchUserTasks,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  fetchTaskProgress,
  updateDayProgress,
  getDayProgress,
  getDefaultTaskCount,
  setDefaultTaskCount,
  resetDefaultTaskCount,
} from '../utils/counterFirebase'
import type { CounterTask, DayProgress } from '../utils/counterFirebase'
import './Counter.css'

type ViewMode = 'tasks' | 'calendar' | 'counter'

const ALL_TASKS = 'all'

function Counter() {
  const { user, loading, login, loginAnonymous } = useAuth()

  useSEO({
    title: 'Tally Counter | Tasbeeh Counter | عداد التسبيح',
    description: 'Digital tally counter for general counting, Islamic prayer, tasbeeh, and dhikr. Count أستغفر الله، اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ، لَا إِلٰهَ إِلَّا اللّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ and more.',
    keywords: 'counter, tally counter, click counter, people counter, digital counter, counting app, tasbeeh counter, tasbih counter, dhikr counter, zikr counter, islamic counter, prayer counter, adhkar counter, muslim counter, digital tasbeeh, عداد تسبيح, عداد الذكر, تسبيح, أذكار, أستغفر الله, اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ, لَا إِلٰهَ إِلَّا اللّٰهُ, سبحان الله, الحمد لله, الله أكبر',
  })

  // View state lives in the URL so browser back walks tasks <- calendar <- counter:
  //   /counter                         -> task list
  //   /counter?task=<id>               -> calendar (or counter for the default task)
  //   /counter?task=<id>&date=<date>   -> counter
  //   /counter?task=all                -> combined calendar of all tasks
  //   /counter?task=<id>&date=<date>&from=all -> counter, back goes to combined calendar
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const selectedTaskId = searchParams.get('task')
  const selectedDate = searchParams.get('date') ?? ''
  const isAllView = selectedTaskId === ALL_TASKS
  const fromAll = searchParams.get('from') === ALL_TASKS

  // Task data
  const [tasks, setTasks] = useState<CounterTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  // Progress (taskId -> date -> progress) is tagged with the calendar it was
  // loaded for (a task id or 'all') so switching never shows stale days
  const [progressState, setProgressState] = useState<{ key: string; data: Record<string, Record<string, DayProgress>> } | null>(null)

  const progress = progressState && progressState.key === selectedTaskId ? progressState.data : {}
  const selectedTask = selectedTaskId && !isAllView ? tasks.find((t) => t.id === selectedTaskId) ?? null : null
  const calendarTasks = tasks.filter((t) => !t.isDefault)
  const calendarTaskIdsKey = calendarTasks.map((t) => t.id).join(',')
  const viewMode: ViewMode = isAllView
    ? 'calendar'
    : !selectedTask
      ? 'tasks'
      : selectedTask.isDefault || selectedDate
        ? 'counter'
        : 'calendar'

  // Last single-task calendar viewed, so toggling "All" off returns to it
  const lastCalendarTaskRef = useRef<string | null>(null)
  const singleCalendarTaskId = viewMode === 'calendar' && selectedTask ? selectedTask.id : null
  useEffect(() => {
    if (singleCalendarTaskId) lastCalendarTaskRef.current = singleCalendarTaskId
  }, [singleCalendarTaskId])

  // Forward step inside the counter flow: push a history entry.
  const goTo = (params: Record<string, string>) => {
    setSearchParams(params, { state: { counterFlow: true } })
  }

  // Back step: pop history if we pushed it, otherwise (deep link / refresh
  // without history) replace with the parent view.
  const goBack = (parent: Record<string, string>) => {
    if ((location.state as { counterFlow?: boolean } | null)?.counterFlow) {
      navigate(-1)
    } else {
      setSearchParams(parent, { replace: true })
    }
  }

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
  const [showEditForm, setShowEditForm] = useState(false)

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

  // Unknown task id in URL (deleted task, stale link) -> back to task list
  useEffect(() => {
    if (!tasksLoading && selectedTaskId && !selectedTask && !isAllView) {
      setSearchParams({}, { replace: true })
    }
  }, [tasksLoading, selectedTaskId, selectedTask, isAllView, setSearchParams])

  // Load count when entering counter mode (keyed on ids so editing the task
  // doesn't refetch and clobber an in-flight count)
  const selectedIsDefault = selectedTask?.isDefault ?? false
  useEffect(() => {
    if (viewMode !== 'counter' || !selectedTaskId || !user) return
    setCount(null) // Show loading
    setFinishShown(false)
    setShowSettings(false)
    setShowEditForm(false)
    let cancelled = false
    if (selectedIsDefault) {
      getDefaultTaskCount(user.uid).then((c) => { if (!cancelled) setCount(c) })
    } else if (selectedDate) {
      getDayProgress(user.uid, selectedTaskId, selectedDate).then((prog) => {
        if (!cancelled) setCount(prog?.count || 0)
      })
    }
    return () => { cancelled = true }
  }, [viewMode, selectedTaskId, selectedIsDefault, selectedDate, user])

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
    let newCount = count + increment

    // Cap at target when reaching it for the first time
    if (
      selectedTask.targetCount !== null &&
      !finishShown &&
      count < selectedTask.targetCount &&
      newCount > selectedTask.targetCount
    ) {
      newCount = selectedTask.targetCount
    }

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

    if (cooldown || showFinishDialog || showEditForm || showResetConfirm) return
    handleIncrement()
  }, [cooldown, showFinishDialog, showEditForm, showResetConfirm, handleIncrement])

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
    // Back to calendar (it refetches progress on mount)
    handleBackFromCounter()
  }

  const handleContinue = () => {
    setShowFinishDialog(false)
  }

  // Default task goes directly to counter; others show calendar first
  const handleSelectTask = (task: CounterTask) => {
    goTo({ task: task.id })
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

  const handleReorderTasks = async (orderedIds: string[]) => {
    if (!user) return
    const byId = new Map(tasks.map((t) => [t.id, t]))
    const defaults = tasks.filter((t) => t.isDefault)
    const reordered = orderedIds
      .map((id, index): CounterTask | null => {
        const t = byId.get(id)
        return t ? { ...t, order: index } : null
      })
      .filter((t): t is CounterTask => t !== null)
    setTasks([...defaults, ...reordered])
    await reorderTasks(user.uid, orderedIds)
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!user) return
    await deleteTask(user.uid, taskId)
    setTasks(tasks.filter((t) => t.id !== taskId))
  }

  const handleMonthChange = useCallback(async (month: string) => {
    if (!user || !selectedTaskId) return
    const ids = selectedTaskId === ALL_TASKS
      ? calendarTaskIdsKey.split(',').filter(Boolean)
      : [selectedTaskId]
    const results = await Promise.all(ids.map((id) => fetchTaskProgress(user.uid, id, month)))
    const data: Record<string, Record<string, DayProgress>> = {}
    ids.forEach((id, i) => { data[id] = results[i] })
    setProgressState({ key: selectedTaskId, data })
  }, [user, selectedTaskId, calendarTaskIdsKey])

  const handleSelectDate = (taskId: string, date: string) => {
    goTo(isAllView ? { task: taskId, date, from: ALL_TASKS } : { task: taskId, date })
  }

  const handleBackFromCounter = () => {
    if (!selectedTask || selectedTask.isDefault) {
      goBack({})
    } else if (fromAll) {
      goBack({ task: ALL_TASKS })
    } else {
      goBack({ task: selectedTask.id })
    }
  }

  // "All" toggles between the combined calendar and the last single-task one.
  // Replaces the history entry, like prev/next, so back still lands on the task list.
  const toggleAllTasks = () => {
    if (isAllView) {
      const last = calendarTasks.find((t) => t.id === lastCalendarTaskRef.current) ?? calendarTasks[0]
      if (last) setSearchParams({ task: last.id }, { replace: true, state: location.state })
    } else {
      setSearchParams({ task: ALL_TASKS }, { replace: true, state: location.state })
    }
  }

  const handleBackFromCalendar = () => {
    goBack({})
  }

  // Circular prev/next between calendar tasks (default task has no calendar).
  // Replaces the history entry so browser back still lands on the task list.
  const switchCalendarTask = (step: 1 | -1) => {
    const idx = calendarTasks.findIndex((t) => t.id === selectedTaskId)
    if (idx === -1 || calendarTasks.length < 2) return
    const next = calendarTasks[(idx + step + calendarTasks.length) % calendarTasks.length]
    setSearchParams({ task: next.id }, { replace: true, state: location.state })
  }

  const handleEditFromCounter = async (values: TaskFormValues) => {
    if (!selectedTask) return
    setShowEditForm(false)
    await handleEditTask(selectedTask.id, values)
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

  // Deep link / refresh into a task while tasks are still loading
  if ((selectedTaskId && !selectedTask && !isAllView) || (isAllView && tasksLoading)) {
    return (
      <div className="counter-page">
        <div className="counter-circle">
          <span className="counter-value" style={{ fontSize: '2rem' }}>...</span>
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
          tasks={tasks}
          loading={tasksLoading}
          onSelectTask={handleSelectTask}
          onAddTask={handleAddTask}
          onEditTask={handleEditTask}
          onDeleteTask={handleDeleteTask}
          onReorderTasks={handleReorderTasks}
        />
      </div>
    )
  }

  // Calendar View
  if (viewMode === 'calendar') {
    const canSwitch = !isAllView && calendarTasks.length > 1
    return (
      <div className="counter-page">
        <TaskCalendar
          title={isAllView ? 'All Tasks' : selectedTask?.name ?? ''}
          tasks={isAllView ? calendarTasks : selectedTask ? [selectedTask] : []}
          progress={progress}
          allMode={isAllView}
          onMonthChange={handleMonthChange}
          onSelectDate={handleSelectDate}
          onBack={handleBackFromCalendar}
          onPrevTask={canSwitch ? () => switchCalendarTask(-1) : undefined}
          onNextTask={canSwitch ? () => switchCalendarTask(1) : undefined}
          onToggleAll={calendarTasks.length > 1 ? toggleAllTasks : undefined}
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
          {selectedTask && !selectedTask.isDefault && (
            <div className="setting-item">
              <button
                className="edit-task-btn"
                onClick={() => {
                  setShowSettings(false)
                  setShowEditForm(true)
                }}
              >
                Edit Task
              </button>
            </div>
          )}
          <div className="setting-item helper-text">
            * Keyboard users: Press [Space] to act as click.
          </div>
        </div>
      )}

      {showEditForm && selectedTask && (
        <TaskForm
          task={selectedTask}
          onSubmit={handleEditFromCounter}
          onCancel={() => setShowEditForm(false)}
        />
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
