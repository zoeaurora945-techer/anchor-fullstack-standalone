/**
 * 锚点小程序 · 云端同步客户端
 *
 * 后端是 tRPC v11 + superjson transformer，HTTP 协议要点：
 *   - Query    : GET  /api/trpc/<router>.<proc>?input=<urlencoded {"json":...}>
 *   - Mutation : POST /api/trpc/<router>.<proc>   body: {"json":...}
 *   - 响应     : {"result":{"data":{"json": <payload>}}}
 *   - 认证     : Authorization: Bearer <token>（Web 端 mobile.issuePairingSession 签发）
 *
 * 小程序不引入 @trpc/client（体积与运行时适配成本高），这里用 Taro.request 直连。
 */
import Taro from '@tarojs/taro'

/** 改成你自己的部署地址（本地联调可用 http://localhost:3000，真机需 HTTPS 且配域名白名单） */
export const API_BASE = 'https://anchor-fullstack-standalone-production.up.railway.app'

const TOKEN_KEY = 'anchor_session_token'

/* ---------------- token ---------------- */

export function getToken(): string {
  return Taro.getStorageSync(TOKEN_KEY) || ''
}

export function setToken(token: string): void {
  Taro.setStorageSync(TOKEN_KEY, token)
}

export function clearToken(): void {
  Taro.removeStorageSync(TOKEN_KEY)
}

export function isPaired(): boolean {
  return Boolean(getToken())
}

/* ---------------- 底层请求 ---------------- */

interface TrpcEnvelope<T> {
  result?: { data?: { json?: T } }
  error?: { json?: { message?: string; code?: number } }
}

type Method = 'GET' | 'POST'

async function request<T>(path: string, method: Method, input?: unknown): Promise<T> {
  const url = `${API_BASE}/api/trpc/${path}`
  const header: Record<string, string> = { 'content-type': 'application/json' }
  const token = getToken()
  if (token) header.Authorization = `Bearer ${token}`

  const data =
    input === undefined ? undefined : (JSON.stringify({ json: input }) as any)

  const res = await Taro.request<TrpcEnvelope<T>>({
    url: method === 'GET' && input !== undefined ? `${url}?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : url,
    method,
    header,
    data: method === 'POST' ? data : undefined,
  })

  if (res.statusCode === 401) {
    clearToken()
    throw new Error('登录已过期，请重新配对')
  }

  const body = res.data as TrpcEnvelope<T> | undefined
  if (body?.error) {
    throw new Error(body.error.json?.message ?? '请求失败')
  }
  if (!body?.result?.data) {
    throw new Error(`返回格式异常: ${path}`)
  }
  return body.result.data.json as T
}

export function trpcQuery<T>(path: string, input?: unknown): Promise<T> {
  return request<T>(path, 'GET', input)
}

export function trpcMutate<T>(path: string, input?: unknown): Promise<T> {
  return request<T>(path, 'POST', input)
}

/* ---------------- 业务 API ---------------- */

export interface Task {
  id: string
  title: string
  notes?: string | null
  status: 'todo' | 'doing' | 'done' | 'dropped'
  projectId?: string | null
  dueAt?: string | null
  duePrecision?: string
  importance?: string
  urgencyMode?: string
  quadrant?: string | null
}

export interface Goal {
  id: string
  title: string
  color?: string
  status?: string
}

export interface Project {
  id: string
  title: string
  goalId?: string | null
  color?: string
  status?: string
}

export interface Snapshot {
  goals: Goal[]
  projects: Project[]
  tasks: Task[]
}

/** 拉取全量/增量数据 */
export function pull(changedSince?: Date): Promise<Snapshot> {
  return trpcQuery<Snapshot>('sync.pull', changedSince ? { changedSince: changedSince.toISOString() } : {})
}

export function getProfile() {
  return trpcQuery('sync.profile')
}

export function listGoals() {
  return trpcQuery<Goal[]>('planning.goals')
}

export function listProjects() {
  return trpcQuery<Project[]>('planning.projects')
}

export function listTasks() {
  return trpcQuery<Task[]>('task.list')
}

/** 新建任务：默认重要，带截止时间自动判定紧急 */
export function createTask(input: {
  title: string
  dueAt?: string | null
  duePrecision?: 'unknown' | 'date' | 'datetime'
  projectId?: string | null
}) {
  const { title, ...rest } = input
  return trpcMutate<Task>('task.create', {
    title,
    dueAt: rest.dueAt ?? null,
    duePrecision: rest.duePrecision ?? 'unknown',
    projectId: rest.projectId ?? null,
  })
}

/** 拖动/切换象限 */
export function moveTask(id: string, quadrant: 'q1' | 'q2' | 'q3' | 'q4') {
  return trpcMutate('task.move', { id, quadrant })
}

/** 完成任务 */
export function finishTask(id: string) {
  return trpcMutate('task.finish', { id, status: 'done' })
}

/** 更新任务字段 */
export function updateTask(patch: Partial<Task> & { id: string }) {
  return trpcMutate('task.update', patch)
}

export function createGoal(title: string, color = '#6EA8FE') {
  return trpcMutate<Goal>('planning.createGoal', { title, color })
}

export function updateGoal(id: string, patch: Partial<Goal>) {
  const { id: _drop, ...rest } = patch as Record<string, unknown>
  return trpcMutate('planning.updateGoal', { id, patch: rest })
}

export function createProject(title: string, goalId?: string | null, color = '#7FB5D6') {
  return trpcMutate<Project>('planning.createProject', { title, goalId: goalId ?? null, color })
}

export function updateProject(id: string, patch: Partial<Project>) {
  const { id: _drop, ...rest } = patch as Record<string, unknown>
  return trpcMutate('planning.updateProject', { id, patch: rest })
}
