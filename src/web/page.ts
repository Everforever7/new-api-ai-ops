export function renderPanelHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>new-api AI 运维助手</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      color-scheme: light dark;
      /* Light Mode */
      --bg: #f8fafc;
      --surface: rgba(255, 255, 255, 0.75);
      --surface-solid: #ffffff;
      --surface-muted: #f1f5f9;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: rgba(226, 232, 240, 0.8);
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --primary-glow: rgba(99, 102, 241, 0.3);
      --danger: #ef4444;
      --danger-bg: #fee2e2;
      --ok: #10b981;
      --ok-bg: #d1fae5;
      --warn: #f59e0b;
      --warn-bg: #fef3c7;
      
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      --shadow-lg: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
      --radius-sm: 8px;
      --radius-md: 16px;
      --radius-lg: 24px;
      
      --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
      --font-mono: 'JetBrains Mono', ui-monospace, monospace;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        /* Dark Mode - Premium Indigo/Slate Theme */
        --bg: #0B0F19;
        --surface: rgba(17, 24, 39, 0.65);
        --surface-solid: #111827;
        --surface-muted: #1e293b;
        --text: #f8fafc;
        --text-muted: #94a3b8;
        --border: rgba(51, 65, 85, 0.6);
        --primary: #818cf8;
        --primary-hover: #a5b4fc;
        --primary-glow: rgba(129, 140, 248, 0.25);
        --danger: #f87171;
        --danger-bg: rgba(239, 68, 68, 0.15);
        --ok: #34d399;
        --ok-bg: rgba(16, 185, 129, 0.15);
        --warn: #fbbf24;
        --warn-bg: rgba(245, 158, 11, 0.15);

        --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.5);
        --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.4);
        --shadow-lg: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
      }
    }

    * { box-sizing: border-box; }
    
    body {
      margin: 0;
      background-color: var(--bg);
      background-image: 
        radial-gradient(circle at 15% 50%, rgba(99, 102, 241, 0.04), transparent 25%),
        radial-gradient(circle at 85% 30%, rgba(168, 85, 247, 0.04), transparent 25%);
      background-attachment: fixed;
      color: var(--text);
      font-family: var(--font-sans);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Glassmorphism Header */
    header {
      position: sticky;
      top: 0;
      z-index: 50;
      background: var(--surface);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
    }

    .shell {
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 32px;
    }

    .topbar {
      height: 76px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.03em;
      background: linear-gradient(135deg, var(--primary) 0%, #a855f7 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      color: transparent;
    }

    /* Tabs */
    .tabs-container {
      position: relative;
      display: flex;
      gap: 8px;
      height: 100%;
      align-items: center;
    }

    .tab {
      position: relative;
      padding: 8px 16px;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 15px;
      cursor: pointer;
      border-radius: var(--radius-sm);
      transition: color 0.3s ease, background 0.3s ease;
      z-index: 1;
    }

    .tab:hover {
      color: var(--text);
      background: rgba(100, 116, 139, 0.05);
    }

    .tab.active {
      color: var(--primary);
    }

    /* Animated Indicator */
    .tab-indicator {
      position: absolute;
      bottom: 12px;
      height: 3px;
      background: linear-gradient(90deg, var(--primary), #a855f7);
      border-radius: 3px;
      transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
      box-shadow: 0 2px 8px var(--primary-glow);
    }

    main {
      padding: 40px 0 80px;
    }

    /* Toolbar */
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 32px;
      flex-wrap: wrap;
      background: var(--surface);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      padding: 20px 28px;
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      border: 1px solid var(--border);
    }

    .toolbar-info {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .toolbar-info .muted {
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.02em;
    }

    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      background: var(--surface-solid);
      color: var(--text);
      border-radius: var(--radius-sm);
      height: 44px;
      padding: 0 20px;
      font-family: var(--font-sans);
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      gap: 8px;
      box-shadow: var(--shadow-sm);
    }

    .button:hover:not(:disabled) {
      background: var(--surface-muted);
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }

    .button:active:not(:disabled) {
      transform: translateY(0);
    }

    .button.primary {
      background: linear-gradient(135deg, var(--primary), #6366f1);
      border: none;
      color: white;
      box-shadow: 0 4px 12px var(--primary-glow);
    }

    .button.primary:hover:not(:disabled) {
      background: linear-gradient(135deg, var(--primary-hover), #4f46e5);
      box-shadow: 0 6px 16px var(--primary-glow);
    }

    .button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
      box-shadow: none !important;
    }

    /* Content Area */
    .tab-content {
      display: none;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.4s ease, transform 0.4s ease;
    }

    .tab-content.active {
      display: block;
      opacity: 1;
      transform: translateY(0);
    }

    /* Dashboard Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 24px;
    }

    .card {
      background: var(--surface-solid);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 28px;
      box-shadow: var(--shadow-md);
      transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
      position: relative;
      overflow: hidden;
    }

    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
      opacity: 0;
      transition: opacity 0.3s;
    }

    .card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg);
      border-color: rgba(99, 102, 241, 0.3);
    }
    
    .card:hover::before { opacity: 1; }

    .card h2 {
      margin: 0 0 16px;
      font-size: 13px;
      color: var(--text-muted);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .metric {
      font-size: 42px;
      font-weight: 800;
      line-height: 1;
      margin-bottom: 12px;
      background: linear-gradient(to bottom right, var(--text), var(--text-muted));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.02em;
    }

    .muted {
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.5;
    }

    /* Badges */
    .status {
      display: inline-flex;
      align-items: center;
      border-radius: 9999px;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      transition: all 0.2s;
    }

    .status::before {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
      box-shadow: 0 0 8px currentColor;
    }

    .status.ok { color: var(--ok); background: var(--ok-bg); }
    .status.ok::before { background: var(--ok); }
    
    .status.warn { color: var(--warn); background: var(--warn-bg); }
    .status.warn::before { background: var(--warn); }
    
    .status.danger { color: var(--danger); background: var(--danger-bg); }
    .status.danger::before { 
      background: var(--danger); 
      animation: pulse 2s infinite; 
    }

    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
      70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
      100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
    }

    /* Report & Table Panels */
    .panel-card {
      background: var(--surface-solid);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      overflow: hidden;
    }

    .panel-header {
      padding: 24px 32px;
      border-bottom: 1px solid var(--border);
      background: rgba(0,0,0,0.02);
    }
    
    .panel-header h2 { 
      margin: 0; 
      font-size: 18px;
      font-weight: 700;
    }

    /* Terminal-like Report */
    pre {
      margin: 0;
      padding: 32px;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 14px;
      font-family: var(--font-mono);
      line-height: 1.7;
      background: #0f111a; /* Always dark for premium tech feel */
      color: #e2e8f0;
      max-height: 600px;
      overflow-y: auto;
    }
    
    /* Custom Scrollbar for pre */
    pre::-webkit-scrollbar { width: 8px; }
    pre::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
    pre::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }

    /* Modern Table */
    .table-wrap {
      overflow-x: auto;
      max-height: 600px;
    }
    
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 14px;
    }

    th, td {
      padding: 16px 32px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    th {
      color: var(--text-muted);
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      position: sticky;
      top: 0;
      background: var(--surface);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 10;
    }

    tbody tr {
      transition: background-color 0.2s ease;
    }

    tbody tr:hover {
      background: var(--surface-muted);
    }
    
    tbody tr:last-child td {
      border-bottom: none;
    }

    .error-text {
      color: var(--danger);
      font-weight: 500;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    @media (max-width: 768px) {
      .shell { padding: 0 16px; }
      .topbar { flex-direction: column; height: auto; padding: 20px 0; gap: 20px; }
      .tabs-container { width: 100%; overflow-x: auto; padding-bottom: 8px; justify-content: flex-start; }
      .toolbar { flex-direction: column; align-items: stretch; padding: 20px; }
      .toolbar-actions { display: flex; gap: 12px; }
      .toolbar-actions button { flex: 1; }
      th, td { padding: 12px 16px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="shell topbar">
      <div class="brand">
        <!-- Logo SVG -->
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="url(#primary-gradient)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <defs>
            <linearGradient id="primary-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#6366f1" />
              <stop offset="100%" stop-color="#a855f7" />
            </linearGradient>
          </defs>
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <h1>new-api AI 运维</h1>
        <span id="run-state" class="status">加载中</span>
      </div>
      <div class="tabs-container">
        <div class="tab active" data-target="tab-dashboard">仪表盘</div>
        <div class="tab" data-target="tab-report">分析报告</div>
        <div class="tab" data-target="tab-channels">渠道快照</div>
        <div class="tab-indicator" id="tab-indicator"></div>
      </div>
    </div>
  </header>
  
  <main class="shell">
    <div class="toolbar">
      <div class="toolbar-info">
        <div class="muted" id="last-run">上次运行: -</div>
        <div id="last-error"></div>
      </div>
      <div class="toolbar-actions" style="display:flex;gap:16px;">
        <button class="button" id="refresh">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          刷新数据
        </button>
        <button class="button primary" id="run">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          立即检查
        </button>
      </div>
    </div>

    <!-- Dashboard Tab -->
    <div id="tab-dashboard" class="tab-content active">
      <div class="grid">
        <div class="card">
          <h2>渠道状态</h2>
          <div class="metric" id="channels-total">-</div>
          <div class="muted" id="channels-detail">-</div>
        </div>
        <div class="card">
          <h2>近期日志</h2>
          <div class="metric" id="logs-total">-</div>
          <div class="muted" id="logs-detail">-</div>
        </div>
        <div class="card">
          <h2>失败率</h2>
          <div class="metric" id="failure-rate">-</div>
          <div class="muted" id="traffic-detail">-</div>
        </div>
        <div class="card">
          <h2>低余额提示</h2>
          <div class="metric" id="low-balance">-</div>
          <div class="muted" id="slowest-detail">-</div>
        </div>
      </div>
    </div>

    <!-- Report Tab -->
    <div id="tab-report" class="tab-content">
      <div class="panel-card">
        <div class="panel-header">
          <h2>最新 AI 分析报告</h2>
        </div>
        <pre id="report">暂无报告。</pre>
      </div>
    </div>

    <!-- Channels Tab -->
    <div id="tab-channels" class="tab-content">
      <div class="panel-card">
        <div class="panel-header">
          <h2>渠道快照列表</h2>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>状态</th>
                <th>余额</th>
                <th>响应延迟</th>
              </tr>
            </thead>
            <tbody id="channels-body">
              <tr><td colspan="5" class="muted" style="text-align: center; padding: 48px;">暂无数据</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

  </main>
  
  <script>
    const el = (id) => document.getElementById(id)

    // Tab Animation Logic
    const tabs = document.querySelectorAll('.tab');
    const indicator = document.getElementById('tab-indicator');
    
    function updateIndicator(activeTab) {
      indicator.style.width = activeTab.offsetWidth + 'px';
      indicator.style.left = activeTab.offsetLeft + 'px';
    }

    // Initialize indicator position
    if (tabs.length > 0) updateIndicator(tabs[0]);
    window.addEventListener('resize', () => {
      const active = document.querySelector('.tab.active');
      if (active) updateIndicator(active);
    });

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        updateIndicator(tab);
        
        // Trigger reflow for animation
        const content = document.getElementById(tab.dataset.target);
        content.classList.remove('active');
        void content.offsetWidth;
        content.classList.add('active');
      });
    });

    async function api(path, options = {}) {
      const res = await fetch(path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.message || res.statusText);
      }
      return data.data;
    }

    function fmtDate(value) {
      if (!value) return '-';
      return new Date(value).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }

    function fmtPct(value) {
      if (typeof value !== 'number') return '-';
      return (value * 100).toFixed(1) + '%';
    }

    function setStatus(running, error) {
      const node = el('run-state');
      node.className = 'status ' + (error ? 'danger' : running ? 'warn' : 'ok');
      node.textContent = error ? '运行异常' : running ? '正在检查' : '系统就绪';
    }

    function renderStatus(data) {
      setStatus(data.running, data.lastError);
      el('last-run').textContent = '上次运行: ' + fmtDate(data.lastRunAt);
      
      const errEl = el('last-error');
      if (data.lastError) {
        errEl.innerHTML = '<span class="error-text"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> ' + data.lastError + '</span>';
        errEl.style.display = 'block';
      } else {
        errEl.style.display = 'none';
      }

      const snapshot = data.lastSnapshot;
      if (!snapshot) {
        el('report').textContent = data.lastReport || '暂无报告。';
        return;
      }

      el('channels-total').textContent = snapshot.channels.total;
      el('channels-detail').textContent =
        '已启用 ' + snapshot.channels.enabled +
        ' / 自动禁用 ' + snapshot.channels.autoDisabled;
      
      el('logs-total').textContent = snapshot.logs.total;
      el('logs-detail').textContent =
        '成功 ' + snapshot.logs.success + ' / 错误 ' + snapshot.logs.errors;
      
      el('failure-rate').textContent = fmtPct(snapshot.logs.failureRate);
      el('traffic-detail').textContent =
        'RPM ' + (snapshot.logs.rpm ?? '-') + ' / TPM ' + (snapshot.logs.tpm ?? '-');
      
      el('low-balance').textContent = snapshot.channels.lowBalance.length;
      el('slowest-detail').textContent =
        snapshot.channels.slowest[0]
          ? '最慢渠道 #' + snapshot.channels.slowest[0].id + ' (' + snapshot.channels.slowest[0].responseTimeMs + 'ms)'
          : '全部极速响应';
          
      el('report').textContent = data.lastReport || '暂无报告。';
    }

    function renderChannels(channels) {
      const body = el('channels-body');
      body.innerHTML = '';
      if (!channels || !channels.length) {
        body.innerHTML = '<tr><td colspan="5" class="muted" style="text-align: center; padding: 48px;">暂无数据</td></tr>';
        return;
      }
      for (const channel of channels.slice(0, 50)) {
        const row = document.createElement('tr');
        row.innerHTML = '<td></td><td></td><td></td><td></td><td></td>';
        const cells = row.querySelectorAll('td');
        
        cells[0].textContent = channel.id;
        cells[0].style.fontWeight = '600';
        cells[0].style.color = 'var(--text)';
        
        cells[1].textContent = channel.name;
        
        const statusSpan = document.createElement('span');
        let statusClass = 'ok';
        let statusText = channel.statusLabel || '未知';
        if (statusText.includes('禁') || statusText.includes('Disabled')) statusClass = 'warn';
        if (statusText.includes('错') || statusText.includes('Error')) statusClass = 'danger';
        statusSpan.className = 'status ' + statusClass;
        statusSpan.textContent = statusText;
        cells[2].appendChild(statusSpan);

        cells[3].textContent =
          typeof channel.balance === 'number' ? '$' + channel.balance.toFixed(2) : '-';
          
        cells[4].textContent =
          channel.responseTimeMs ? channel.responseTimeMs + ' ms' : '-';
          
        body.appendChild(row);
      }
    }

    async function refreshAll() {
      const btn = el('refresh');
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<svg class="animate-spin" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="animation: spin 1s linear infinite;"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> 刷新中...';
      
      if (!document.querySelector('#spin-style')) {
        const style = document.createElement('style');
        style.id = 'spin-style';
        style.innerHTML = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
      }

      try {
        const [status, channels] = await Promise.all([
          api('/api/status'),
          api('/api/channels').catch(() => []),
        ]);
        renderStatus(status);
        renderChannels(channels);
      } catch (e) {
        console.error(e);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }

    async function runCheck() {
      const button = el('run');
      const originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<svg class="animate-spin" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="animation: spin 1s linear infinite;"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> 检查中...';
      
      try {
        await api('/api/run', { method: 'POST', body: '{}' });
        await refreshAll();
      } catch (error) {
        const errEl = el('last-error');
        errEl.innerHTML = '<span class="error-text"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> ' + error.message + '</span>';
        errEl.style.display = 'block';
        setStatus(false, error.message);
      } finally {
        button.disabled = false;
        button.innerHTML = originalHtml;
      }
    }

    el('refresh').addEventListener('click', refreshAll);
    el('run').addEventListener('click', runCheck);
    
    // Initial Load
    refreshAll().catch((error) => {
      const errEl = el('last-error');
      errEl.innerHTML = '<span class="error-text"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> ' + error.message + '</span>';
      errEl.style.display = 'block';
      setStatus(false, error.message);
    });
  </script>
</body>
</html>`;
}
