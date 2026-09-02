import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import {
  API_BASE,
  isPaired,
  setToken,
  clearToken,
  pull,
  createTask,
  finishTask,
  type Task,
} from '../../services/api'
import './index.scss'

const QUADRANT_LABEL: Record<string, string> = {
  q1: '重要且紧急',
  q3: '重要不紧急',
  q2: '不重要但紧急',
  q4: '不重要不紧急',
}

export default function Index() {
  const [paired, setPaired] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setPaired(isPaired())
  }, [])

  useEffect(() => {
    if (paired) void loadTasks()
  }, [paired])

  async function loadTasks() {
    setLoading(true)
    setError('')
    try {
      const snap = await pull()
      setTasks((snap.tasks ?? []).filter((t) => t.status !== 'done' && t.status !== 'dropped'))
    } catch (e: any) {
      setError(e?.message ?? '加载失败')
      if (String(e?.message ?? '').includes('登录已过期')) setPaired(false)
    } finally {
      setLoading(false)
    }
  }

  function handlePair() {
    const token = tokenInput.trim()
    if (!token) {
      setError('请输入配对令牌')
      return
    }
    setToken(token)
    setPaired(true)
    setTokenInput('')
    setError('')
  }

  function handleUnpair() {
    clearToken()
    setPaired(false)
    setTasks([])
  }

  async function handleAdd() {
    const title = newTask.trim()
    if (!title) return
    try {
      await createTask({ title })
      setNewTask('')
      await loadTasks()
      Taro.showToast({ title: '已创建', icon: 'success' })
    } catch (e: any) {
      setError(e?.message ?? '创建失败')
    }
  }

  async function handleFinish(id: string) {
    try {
      await finishTask(id)
      await loadTasks()
      Taro.showToast({ title: '已完成', icon: 'success' })
    } catch (e: any) {
      setError(e?.message ?? '操作失败')
    }
  }

  /* ---------- 未配对：显示配对引导 ---------- */
  if (!paired) {
    return (
      <View className='index'>
        <Text className='title'>锚点 · 小程序</Text>
        <Text className='hint'>
          在网页端「设置 → 跨端同步与小程序」生成配对令牌，粘贴到下方完成配对。
        </Text>
        <Text className='endpoint'>{API_BASE}</Text>
        <Input
          className='input'
          value={tokenInput}
          placeholder='粘贴配对令牌'
          onInput={(e) => setTokenInput(e.detail.value)}
        />
        <Button className='btn' onClick={handlePair}>
          配对并同步
        </Button>
        {error ? <Text className='error'>{error}</Text> : null}
      </View>
    )
  }

  /* ---------- 已配对：任务列表 ---------- */
  return (
    <View className='index'>
      <View className='header'>
        <Text className='title'>今天做什么</Text>
        <Text className='link' onClick={handleUnpair}>
          解除配对
        </Text>
      </View>

      <View className='composer'>
        <Input
          className='input'
          value={newTask}
          placeholder='例如：今天 17:00 前完成项目方案'
          onInput={(e) => setNewTask(e.detail.value)}
        />
        <Button className='btn' onClick={handleAdd}>
          添加
        </Button>
      </View>

      {loading ? <Text className='hint'>加载中...</Text> : null}
      {error ? <Text className='error'>{error}</Text> : null}

      {!loading && tasks.length === 0 ? (
        <Text className='hint'>还没有待办任务</Text>
      ) : null}

      <View className='list'>
        {tasks.map((task) => (
          <View key={task.id} className='task-item'>
            <Button className='check' onClick={() => handleFinish(task.id)}>
              ✓
            </Button>
            <View className='task-body'>
              <Text className='task-title'>{task.title}</Text>
              <Text className='task-meta'>
                {task.quadrant ? QUADRANT_LABEL[task.quadrant] ?? '未分类' : '未分类'}
                {task.dueAt ? ` · ${new Date(task.dueAt).toLocaleString()}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}
