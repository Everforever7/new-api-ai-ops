export function renderPanelHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>new-api AI Ops</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f6f7f9;
      --surface: #ffffff;
      --surface-muted: #f0f2f5;
      --text: #16181d;
      --muted: #667085;
      --border: #d8dde6;
      --primary: #155eef;
      --danger: #b42318;
      --ok: #067647;
      --warn: #b54708;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #101216;
        --surface: #171a21;
        --surface-muted: #20242d;
        --text: #f2f4f7;
        --muted: #98a2b3;
        --border: #303645;
        --primary: #84adff;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    header {
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }
    .shell {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
    }
    .topbar {
      min-height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
    }
    main {
      padding: 24px 0 40px;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }
    .button {
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      border-radius: 7px;
      min-height: 36px;
      padding: 0 12px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .button.primary {
      background: var(--primary);
      border-color: var(--primary);
      color: white;
    }
    .button:disabled {
      opacity: .55;
      cursor: not-allowed;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
    }
    .card h2 {
      margin: 0 0 8px;
      font-size: 14px;
      color: var(--muted);
      font-weight: 600;
    }
    .metric {
      font-size: 28px;
      font-weight: 750;
      line-height: 1.15;
    }
    .muted {
      color: var(--muted);
      font-size: 13px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 9px;
      background: var(--surface-muted);
      color: var(--muted);
      font-size: 13px;
      font-weight: 650;
    }
    .status.ok { color: var(--ok); }
    .status.warn { color: var(--warn); }
    .status.danger { color: var(--danger); }
    .panel {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(320px, .65fr);
      gap: 16px;
      align-items: start;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 13px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      padding: 8px 6px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-weight: 650;
    }
    .table-wrap {
      overflow-x: auto;
    }
    .error {
      color: var(--danger);
      font-weight: 650;
    }
    @media (max-width: 900px) {
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .panel { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .shell { width: min(100% - 20px, 1180px); }
      .grid { grid-template-columns: 1fr; }
      .metric { font-size: 24px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="shell topbar">
      <h1>new-api AI Ops</h1>
      <span id="run-state" class="status">Loading</span>
    </div>
  </header>
  <main class="shell">
    <div class="toolbar">
      <div>
        <div class="muted" id="last-run">Last run: -</div>
        <div class="muted" id="last-error"></div>
      </div>
      <div>
        <button class="button" id="refresh">Refresh</button>
        <button class="button primary" id="run">Run Check</button>
      </div>
    </div>

    <section class="grid">
      <div class="card">
        <h2>Channels</h2>
        <div class="metric" id="channels-total">-</div>
        <div class="muted" id="channels-detail">-</div>
      </div>
      <div class="card">
        <h2>Recent Logs</h2>
        <div class="metric" id="logs-total">-</div>
        <div class="muted" id="logs-detail">-</div>
      </div>
      <div class="card">
        <h2>Failure Rate</h2>
        <div class="metric" id="failure-rate">-</div>
        <div class="muted" id="traffic-detail">-</div>
      </div>
      <div class="card">
        <h2>Low Balance</h2>
        <div class="metric" id="low-balance">-</div>
        <div class="muted" id="slowest-detail">-</div>
      </div>
    </section>

    <section class="panel">
      <div class="card">
        <h2>Latest Report</h2>
        <pre id="report">No report yet.</pre>
      </div>
      <div class="card">
        <h2>Channel Snapshot</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Balance</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody id="channels-body">
              <tr><td colspan="5" class="muted">No data</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </main>
  <script>
    const el = (id) => document.getElementById(id)

    async function api(path, options = {}) {
      const res = await fetch(path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) {
        throw new Error(data.message || res.statusText)
      }
      return data.data
    }

    function fmtDate(value) {
      if (!value) return '-'
      return new Date(value).toLocaleString()
    }

    function fmtPct(value) {
      if (typeof value !== 'number') return '-'
      return (value * 100).toFixed(1) + '%'
    }

    function setStatus(running, error) {
      const node = el('run-state')
      node.className = 'status ' + (error ? 'danger' : running ? 'warn' : 'ok')
      node.textContent = error ? 'Error' : running ? 'Running' : 'Ready'
    }

    function renderStatus(data) {
      setStatus(data.running, data.lastError)
      el('last-run').textContent = 'Last run: ' + fmtDate(data.lastRunAt)
      el('last-error').textContent = data.lastError || ''
      el('last-error').className = data.lastError ? 'error' : 'muted'

      const snapshot = data.lastSnapshot
      if (!snapshot) {
        el('report').textContent = data.lastReport || 'No report yet.'
        return
      }

      el('channels-total').textContent = snapshot.channels.total
      el('channels-detail').textContent =
        'Enabled ' + snapshot.channels.enabled +
        ' / Auto disabled ' + snapshot.channels.autoDisabled
      el('logs-total').textContent = snapshot.logs.total
      el('logs-detail').textContent =
        'Success ' + snapshot.logs.success + ' / Errors ' + snapshot.logs.errors
      el('failure-rate').textContent = fmtPct(snapshot.logs.failureRate)
      el('traffic-detail').textContent =
        'RPM ' + (snapshot.logs.rpm ?? '-') + ' / TPM ' + (snapshot.logs.tpm ?? '-')
      el('low-balance').textContent = snapshot.channels.lowBalance.length
      el('slowest-detail').textContent =
        snapshot.channels.slowest[0]
          ? 'Slowest #' + snapshot.channels.slowest[0].id + ' ' + snapshot.channels.slowest[0].responseTimeMs + 'ms'
          : '-'
      el('report').textContent = data.lastReport || 'No report yet.'
    }

    function renderChannels(channels) {
      const body = el('channels-body')
      body.innerHTML = ''
      if (!channels.length) {
        body.innerHTML = '<tr><td colspan="5" class="muted">No data</td></tr>'
        return
      }
      for (const channel of channels.slice(0, 30)) {
        const row = document.createElement('tr')
        row.innerHTML =
          '<td></td><td></td><td></td><td></td><td></td>'
        const cells = row.querySelectorAll('td')
        cells[0].textContent = channel.id
        cells[1].textContent = channel.name
        cells[2].textContent = channel.statusLabel
        cells[3].textContent =
          typeof channel.balance === 'number' ? '$' + channel.balance.toFixed(2) : '-'
        cells[4].textContent =
          channel.responseTimeMs ? channel.responseTimeMs + 'ms' : '-'
        body.appendChild(row)
      }
    }

    async function refreshAll() {
      const [status, channels] = await Promise.all([
        api('/api/status'),
        api('/api/channels').catch(() => []),
      ])
      renderStatus(status)
      renderChannels(channels)
    }

    async function runCheck() {
      const button = el('run')
      button.disabled = true
      button.textContent = 'Running'
      try {
        await api('/api/run', { method: 'POST', body: '{}' })
        await refreshAll()
      } catch (error) {
        el('last-error').textContent = error.message
        el('last-error').className = 'error'
        setStatus(false, error.message)
      } finally {
        button.disabled = false
        button.textContent = 'Run Check'
      }
    }

    el('refresh').addEventListener('click', refreshAll)
    el('run').addEventListener('click', runCheck)
    refreshAll().catch((error) => {
      el('last-error').textContent = error.message
      el('last-error').className = 'error'
      setStatus(false, error.message)
    })
  </script>
</body>
</html>`
}
