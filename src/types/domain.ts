export type ApiEnvelope<T> = {
  success?: boolean
  message?: string
  data?: T
}

export type Channel = {
  id: number
  type: number
  status: number
  name: string
  group?: string
  models?: string
  tag?: string | null
  base_url?: string | null
  balance?: number
  balance_updated_time?: number
  response_time?: number
  test_time?: number
  priority?: number | null
  weight?: number | null
  auto_ban?: number | null
  used_quota?: number
  channel_info?: {
    is_multi_key?: boolean
    multi_key_size?: number
    multi_key_mode?: string
  }
}

export type ChannelListData = {
  items: Channel[]
  total: number
  page?: number
  page_size?: number
  type_counts?: Record<string, number>
}

export type UsageLog = {
  id: number
  user_id?: number
  created_at?: number
  type: number
  content?: string
  username?: string
  token_name?: string
  model_name?: string
  quota?: number
  prompt_tokens?: number
  completion_tokens?: number
  use_time?: number
  is_stream?: boolean
  channel?: number
  channel_name?: string | null
  group?: string
  other?: string
  request_id?: string
  upstream_request_id?: string
}

export type LogListData = {
  items: UsageLog[]
  total: number
  page?: number
  page_size?: number
}

export type LogStats = {
  quota?: number
  rpm?: number
  tpm?: number
}

export type ProposedAction = {
  action: string
  target?: string
  risk: 'low' | 'medium' | 'high'
  requires_confirm: boolean
  reason: string
}

export type HealthSnapshot = {
  generatedAt: string
  window: {
    start: string
    end: string
    hours: number
  }
  channels: {
    total: number
    enabled: number
    manuallyDisabled: number
    autoDisabled: number
    lowBalance: Array<{
      id: number
      name: string
      balance: number
      tag?: string | null
    }>
    slowest: Array<{
      id: number
      name: string
      responseTimeMs: number
    }>
  }
  logs: {
    total: number
    success: number
    errors: number
    failureRate: number
    rpm?: number
    tpm?: number
    quota?: number
    topErrorChannels: Array<{
      channelId: number
      channelName: string
      count: number
      sample: string
    }>
    topModels: Array<{
      model: string
      count: number
      errors: number
    }>
  }
  policy: {
    minRequests: number
    failureRateThreshold: number
  }
}
