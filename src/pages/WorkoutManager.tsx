import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import './WorkoutManager.css'

interface Workout {
  id: string
  name: string
  targetReps: number
  totalSteps: number
  coolTime: number
}

interface StepLog {
  step: number
  reps: number
  coolTimeUsed: number
}

interface SessionLog {
  id: string
  workoutId: string
  workoutName: string
  date: string
  targetReps: number
  targetSteps: number
  coolTime: number
  steps: StepLog[]
  totalReps: number
}

type View = 'list' | 'create' | 'edit' | 'play' | 'logs'
type PlayPhase = 'doing' | 'resting' | 'confirm-reps'

export function WorkoutManager() {
  const [view, setView] = useState<View>('list')
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [logs, setLogs] = useState<SessionLog[]>([])

  // Create/Edit form
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [targetReps, setTargetReps] = useState(10)
  const [totalSteps, setTotalSteps] = useState(5)
  const [coolTime, setCoolTime] = useState(30)

  // Play mode
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [currentReps, setCurrentReps] = useState(0)
  const [stepLogs, setStepLogs] = useState<StepLog[]>([])
  const [timer, setTimer] = useState(0)
  const [phase, setPhase] = useState<PlayPhase>('doing')
  const [showSplash, setShowSplash] = useState(false)
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  const [showContinueDialog, setShowContinueDialog] = useState(false)
  const [showDeleteWorkoutDialog, setShowDeleteWorkoutDialog] = useState<string | null>(null)
  const [showDeleteLogDialog, setShowDeleteLogDialog] = useState<string | null>(null)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const timerStartRef = useRef<number>(0)

  useEffect(() => {
    const savedWorkouts = localStorage.getItem('workout_v2_templates')
    const savedLogs = localStorage.getItem('workout_v2_logs')
    if (savedWorkouts) setWorkouts(JSON.parse(savedWorkouts))
    if (savedLogs) setLogs(JSON.parse(savedLogs))
  }, [])

  useEffect(() => {
    localStorage.setItem('workout_v2_templates', JSON.stringify(workouts))
  }, [workouts])

  useEffect(() => {
    localStorage.setItem('workout_v2_logs', JSON.stringify(logs))
  }, [logs])

  const soundPlayedRef = useRef(false)

  useEffect(() => {
    let interval: number
    if (phase === 'resting') {
      soundPlayedRef.current = false
      const coolDuration = activeWorkout?.coolTime || 30
      interval = setInterval(() => {
        const elapsed = Math.round((Date.now() - timerStartRef.current) / 1000)
        const remaining = coolDuration - elapsed
        setTimer(remaining)
        if (remaining <= 0 && !soundPlayedRef.current) {
          soundPlayedRef.current = true
          playSound()
          triggerSplash()
        }
      }, 200)
    }
    return () => clearInterval(interval)
  }, [phase, activeWorkout])

  // Play sound when tab becomes visible if timer ended in background
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && phase === 'resting') {
        const coolDuration = activeWorkout?.coolTime || 30
        const elapsed = Math.round((Date.now() - timerStartRef.current) / 1000)
        if (elapsed >= coolDuration && !soundPlayedRef.current) {
          soundPlayedRef.current = true
          playSound()
          triggerSplash()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [phase, activeWorkout])

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  }

  const sendNotification = () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Rest Complete!', {
        body: `Time to start ${activeWorkout?.name || 'workout'}!`,
        icon: '/favicon.ico',
        tag: 'workout-timer',
        requireInteraction: true
      })
    }
  }

  const playSound = async () => {
    // Send notification (works in background!)
    sendNotification()

    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') await ctx.resume()

      // Play 3 beeps
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 880
        osc.type = 'square'
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.3)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.3 + 0.2)
        osc.start(ctx.currentTime + i * 0.3)
        osc.stop(ctx.currentTime + i * 0.3 + 0.2)
      }
    } catch (e) { console.log('Audio error', e) }
  }

  const triggerSplash = () => {
    setShowSplash(true)
    setTimeout(() => setShowSplash(false), 1500)
  }

  const saveWorkout = () => {
    if (!name.trim()) return
    const workout: Workout = {
      id: Date.now().toString(),
      name: name.trim(),
      targetReps,
      totalSteps,
      coolTime
    }
    setWorkouts([...workouts, workout])
    resetForm()
    setView('list')
  }

  const editWorkout = (w: Workout) => {
    setEditingId(w.id)
    setName(w.name)
    setTargetReps(w.targetReps)
    setTotalSteps(w.totalSteps)
    setCoolTime(w.coolTime)
    setView('edit')
  }

  const updateWorkout = () => {
    if (!name.trim() || !editingId) return
    setWorkouts(workouts.map(w =>
      w.id === editingId
        ? { ...w, name: name.trim(), targetReps, totalSteps, coolTime }
        : w
    ))
    resetForm()
    setView('list')
  }

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setTargetReps(10)
    setTotalSteps(5)
    setCoolTime(30)
  }

  const confirmDeleteWorkout = () => {
    if (showDeleteWorkoutDialog) {
      setWorkouts(workouts.filter(w => w.id !== showDeleteWorkoutDialog))
      setShowDeleteWorkoutDialog(null)
    }
  }

  const startWorkout = async (workout: Workout) => {
    // Request notification permission on first workout
    await requestNotificationPermission()

    setActiveWorkout(workout)
    setCurrentStep(1)
    setCurrentReps(workout.targetReps)
    setStepLogs([])
    setTimer(0)
    setPhase('doing')
    setView('play')
  }

  const completeStep = () => {
    setPhase('confirm-reps')
    setCurrentReps(activeWorkout?.targetReps || 0)
  }

  const confirmRepsAndAsk = () => {
    // Only ask continue/finish after reaching step limit
    if (currentStep >= (activeWorkout?.totalSteps || 0)) {
      setShowContinueDialog(true)
    } else {
      // Within limit, start timer directly
      startRestTimer()
    }
  }

  const startRestTimer = () => {
    setPhase('resting')
    setTimer(activeWorkout?.coolTime || 30)
    timerStartRef.current = Date.now()
  }

  const continueWithTimer = () => {
    setShowContinueDialog(false)
    startRestTimer()
  }

  const finishNow = () => {
    setShowContinueDialog(false)
    const newLog: StepLog = {
      step: currentStep,
      reps: currentReps,
      coolTimeUsed: 0
    }
    const finalLogs = [...stepLogs, newLog]
    finishWorkoutFinal(finalLogs)
  }

  const finishRest = () => {
    const elapsed = Math.round((Date.now() - timerStartRef.current) / 1000)
    const newLog: StepLog = {
      step: currentStep,
      reps: currentReps,
      coolTimeUsed: elapsed
    }
    setStepLogs([...stepLogs, newLog])
    setCurrentStep(s => s + 1)
    setCurrentReps(activeWorkout?.targetReps || 0)
    setPhase('doing')
    setTimer(0)
  }

  const finishWorkoutFinal = (finalLogs?: StepLog[]) => {
    const logsToSave = finalLogs || stepLogs
    // Stop timer first
    setPhase('doing')
    setTimer(0)

    if (!activeWorkout || logsToSave.length === 0) {
      setView('list')
      setShowFinishDialog(false)
      return
    }
    const session: SessionLog = {
      id: Date.now().toString(),
      workoutId: activeWorkout.id,
      workoutName: activeWorkout.name,
      date: new Date().toLocaleString(),
      targetReps: activeWorkout.targetReps,
      targetSteps: activeWorkout.totalSteps,
      coolTime: activeWorkout.coolTime,
      steps: logsToSave,
      totalReps: logsToSave.reduce((s, x) => s + x.reps, 0)
    }
    setLogs([session, ...logs])
    setActiveWorkout(null)
    setStepLogs([])
    setView('list')
    setShowFinishDialog(false)
  }

  const confirmDeleteLog = () => {
    if (showDeleteLogDialog) {
      setLogs(logs.filter(l => l.id !== showDeleteLogDialog))
      setShowDeleteLogDialog(null)
    }
  }

  const formatTimer = (t: number) => {
    const abs = Math.abs(t)
    const sign = t < 0 ? '+' : ''
    return sign + abs
  }

  return (
    <div className={`workout-container ${showSplash ? 'splash-active' : ''}`}>
      {showSplash && <div className="splash-overlay"><span>GO!</span></div>}

      {showFinishDialog && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h3>Finish Workout?</h3>
            <p>Are you sure you want to end this workout?</p>
            <div className="dialog-actions">
              <button onClick={() => setShowFinishDialog(false)}>Cancel</button>
              <button className="confirm" onClick={() => finishWorkoutFinal()}>Yes, Finish</button>
            </div>
          </div>
        </div>
      )}

      {showContinueDialog && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h3>All {activeWorkout?.totalSteps} Steps Done!</h3>
            <p>Logged {currentReps} reps. Continue with bonus or finish?</p>
            <div className="dialog-actions">
              <button className="confirm-green" onClick={continueWithTimer}>Continue</button>
              <button className="confirm" onClick={finishNow}>Finish</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteWorkoutDialog && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h3>Delete Workout?</h3>
            <p>Are you sure you want to delete this workout?</p>
            <div className="dialog-actions">
              <button onClick={() => setShowDeleteWorkoutDialog(null)}>Cancel</button>
              <button className="confirm" onClick={confirmDeleteWorkout}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteLogDialog && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h3>Delete Log?</h3>
            <p>Are you sure you want to delete this log?</p>
            <div className="dialog-actions">
              <button onClick={() => setShowDeleteLogDialog(null)}>Cancel</button>
              <button className="confirm" onClick={confirmDeleteLog}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <Link to="/" className="back-link">← Back</Link>
      <h1>Workout Manager</h1>

      {view === 'list' && (
        <>
          <div className="view-tabs">
            <button className="tab-btn active">My Workouts</button>
            <button className="tab-btn" onClick={() => setView('logs')}>Logs</button>
          </div>

          <button className="create-btn" onClick={() => setView('create')}>+ Create Workout</button>

          {workouts.length === 0 ? (
            <p className="empty-msg">No workouts yet. Create one!</p>
          ) : (
            <div className="workout-list">
              {workouts.map(w => (
                <div key={w.id} className="workout-card">
                  <div className="workout-info">
                    <strong>{w.name}</strong>
                    <span>{w.totalSteps} steps × {w.targetReps} reps · {w.coolTime}s rest</span>
                  </div>
                  <div className="workout-actions">
                    <button className="play-btn" onClick={() => startWorkout(w)}>▶</button>
                    <button className="edit-btn" onClick={() => editWorkout(w)}>✎</button>
                    <button className="del-btn" onClick={() => setShowDeleteWorkoutDialog(w.id)}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {(view === 'create' || view === 'edit') && (
        <div className="create-form">
          <button className="back-btn" onClick={() => { resetForm(); setView('list'); }}>← Back</button>
          <h2>{view === 'edit' ? 'Edit Workout' : 'Create Workout'}</h2>

          <label>Workout Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Push-ups" />

          <label>Target Reps per Step</label>
          <input type="number" value={targetReps} onChange={e => setTargetReps(Number(e.target.value))} min={1} />

          <label>Total Steps</label>
          <input type="number" value={totalSteps} onChange={e => setTotalSteps(Number(e.target.value))} min={1} />

          <label>Cool Time (seconds)</label>
          <input type="number" value={coolTime} onChange={e => setCoolTime(Number(e.target.value))} min={5} />

          <button className="save-btn" onClick={view === 'edit' ? updateWorkout : saveWorkout}>
            {view === 'edit' ? 'Update Workout' : 'Save Workout'}
          </button>
        </div>
      )}

      {view === 'play' && activeWorkout && (
        <div className="play-mode">
          <div className="play-header">
            <h2>{activeWorkout.name}</h2>
            <span className="step-indicator">
              Step {currentStep} {currentStep > activeWorkout.totalSteps ? '(Bonus!)' : `of ${activeWorkout.totalSteps}`}
            </span>
          </div>

          {phase === 'doing' && (
            <div className="doing-section">
              <div className="target-display">
                <span className="target-label">Target</span>
                <span className="target-value">{activeWorkout.targetReps} reps</span>
              </div>
              <button className="step-done-btn" onClick={completeStep}>
                ✓ Step {currentStep} Completed
              </button>
            </div>
          )}

          {phase === 'confirm-reps' && (
            <div className="confirm-reps-section">
              <p className="confirm-label">How many reps did you do?</p>
              <div className="num-control">
                <button onClick={() => setCurrentReps(r => Math.max(0, r - 1))}>-</button>
                <input type="number" value={currentReps} onChange={e => setCurrentReps(Number(e.target.value))} />
                <button onClick={() => setCurrentReps(r => r + 1)}>+</button>
              </div>
              <button className="start-timer-btn" onClick={confirmRepsAndAsk}>
                Done
              </button>
            </div>
          )}

          {phase === 'resting' && (
            <div className="rest-section">
              <div className={`timer-circle ${timer < 0 ? 'negative' : ''}`}>
                <span className="timer-num">{formatTimer(timer)}</span>
                <span className="timer-label">{timer < 0 ? 'OVERTIME' : 'REST'}</span>
              </div>
              <p className="rest-info">Logged: {currentReps} reps for Step {currentStep}</p>
              <button className="rest-done-btn" onClick={finishRest}>
                Done - Next Step
              </button>
            </div>
          )}

          {stepLogs.length > 0 && (
            <div className="session-log-table">
              <h3>Session Log</h3>
              <table>
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Reps (Target: {activeWorkout.targetReps})</th>
                    <th>Rest Used</th>
                  </tr>
                </thead>
                <tbody>
                  {stepLogs.map((log, i) => (
                    <tr key={i}>
                      <td>{log.step}</td>
                      <td className={log.reps >= activeWorkout.targetReps ? 'good' : 'low'}>{log.reps}</td>
                      <td>{log.coolTimeUsed}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="totals">Total: {stepLogs.reduce((a, s) => a + s.reps, 0)} reps</p>
            </div>
          )}

          <button className="finish-btn" onClick={() => setShowFinishDialog(true)}>
            Finish Workout
          </button>
        </div>
      )}

      {view === 'logs' && (
        <>
          <div className="view-tabs">
            <button className="tab-btn" onClick={() => setView('list')}>My Workouts</button>
            <button className="tab-btn active">Logs</button>
          </div>

          {logs.length === 0 ? (
            <p className="empty-msg">No workout logs yet</p>
          ) : (
            <div className="logs-list">
              {logs.map(log => (
                <div key={log.id} className="log-card">
                  <div className="log-header">
                    <strong>{log.workoutName}</strong>
                    <span>{log.date}</span>
                    <button className="del-btn" onClick={() => setShowDeleteLogDialog(log.id)}>×</button>
                  </div>
                  <p className="log-targets">Target: {log.targetSteps || '?'} steps × {log.targetReps} reps · {log.coolTime || '?'}s rest</p>
                  <table className="log-table">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Reps (Target: {log.targetReps})</th>
                        <th>Rest (Target: {log.coolTime || '?'}s)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {log.steps.map((s, i) => (
                        <tr key={i}>
                          <td>{s.step}</td>
                          <td className={s.reps >= log.targetReps ? 'good' : 'low'}>{s.reps}</td>
                          <td>{s.coolTimeUsed}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="log-total">Total: {log.totalReps} reps</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default WorkoutManager
