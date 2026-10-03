export const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Aira Bot — Control Center</title>
<style>
  :root {
    --bg: #0b0d14;
    --panel: #141826;
    --panel2: #1b2032;
    --line: #262c42;
    --text: #e8ebf5;
    --muted: #8b93ad;
    --accent: #ff5c8a;
    --accent2: #8b5cf6;
    --ok: #34d399;
    --bad: #f87171;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: radial-gradient(1200px 600px at 20% -10%, #2a1338 0%, transparent 60%),
                radial-gradient(1000px 500px at 110% 10%, #10203f 0%, transparent 55%),
                var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    min-height: 100vh;
  }
  .wrap { max-width: 880px; margin: 0 auto; padding: 32px 20px 80px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 26px; margin: 0; letter-spacing: -0.5px; }
  h1 span { background: linear-gradient(90deg, var(--accent), var(--accent2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .sub { color: var(--muted); font-size: 13px; margin-top: 6px; }
  .card {
    background: linear-gradient(180deg, var(--panel), var(--panel2));
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 22px;
    margin-top: 20px;
    box-shadow: 0 10px 30px rgba(0,0,0,.35);
  }
  h2 { font-size: 15px; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); }
  label { display: block; font-size: 13px; color: var(--muted); margin: 14px 0 6px; }
  input[type=text], input[type=number], textarea, select {
    width: 100%; background: #0e1120; color: var(--text);
    border: 1px solid var(--line); border-radius: 10px;
    padding: 11px 12px; font-size: 14px; font-family: inherit;
    outline: none; transition: border-color .15s;
  }
  input:focus, textarea:focus, select:focus { border-color: var(--accent2); }
  textarea { min-height: 130px; resize: vertical; line-height: 1.5; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 640px) { .row { grid-template-columns: 1fr; } }
  .inline { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
  input[type=range] { width: 100%; accent-color: var(--accent); }
  .badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--line); background: #0e1120; margin: 0 6px 6px 0; }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .dot.ok { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
  .dot.bad { background: var(--bad); box-shadow: 0 0 8px var(--bad); }
  button {
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    color: white; border: none; border-radius: 10px;
    padding: 12px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
    transition: transform .1s, opacity .15s;
  }
  button:hover { transform: translateY(-1px); }
  button:active { transform: translateY(0); }
  button.ghost { background: #0e1120; border: 1px solid var(--line); color: var(--text); }
  .btns { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
  .toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(80px);
    background: #101426; border: 1px solid var(--line); color: var(--text);
    padding: 12px 18px; border-radius: 12px; font-size: 14px; opacity: 0;
    transition: all .3s; z-index: 50; pointer-events: none;
  }
  .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
  .toast.err { border-color: var(--bad); color: var(--bad); }
  .chat { display: flex; gap: 8px; margin-top: 10px; }
  .chat input { flex: 1; }
  .bubble {
    background: #0e1120; border: 1px solid var(--line); border-radius: 12px;
    padding: 12px 14px; font-size: 14px; line-height: 1.5; margin-top: 12px;
    white-space: pre-wrap; min-height: 46px; color: var(--text);
  }
  .lock { max-width: 380px; margin: 12vh auto; text-align: center; }
  .lock input { text-align: center; margin-top: 14px; }
  .hidden { display: none !important; }
  .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 26px; }
  .tab {
    background: #0e1120; color: var(--muted); border: 1px solid var(--line);
    border-radius: 999px; padding: 9px 18px; font-size: 13.5px; font-weight: 600;
  }
  .tab.active {
    background: linear-gradient(90deg, rgba(255,92,138,.22), rgba(139,92,246,.22));
    border-color: var(--accent); color: var(--text);
  }
  .tab:hover { transform: none; }
  .pane .card:first-child { margin-top: 16px; }
  .toggle { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
  .toggle input { width: auto; }
  .toggle span { font-size: 13.5px; color: var(--text); }
  .summary div { padding: 9px 0; border-bottom: 1px dashed var(--line); font-size: 13.5px; color: var(--text); }
  .summary div:last-child { border-bottom: none; }
  .summary b { color: var(--accent); font-weight: 600; }
  .summary i { color: var(--muted); font-style: normal; }
  .pane { animation: fadeIn .18s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .warn {
    background: rgba(248,113,113,.08); border: 1px solid rgba(248,113,113,.4);
    color: #fca5a5; font-size: 13px; padding: 10px 14px; border-radius: 10px; margin-top: 16px;
  }
  .foot { color: var(--muted); font-size: 12px; text-align: center; margin-top: 26px; }
  code { background: #0e1120; padding: 2px 6px; border-radius: 6px; color: #c4b5fd; }
</style>
</head>
<body>
  <div class="lock card hidden" id="lock">
    <h1 style="font-size:20px">Enter admin password</h1>
    <div class="sub">Set by the <code>ADMIN_PASSWORD</code> environment variable.</div>
    <input type="password" id="pwInput" placeholder="password" />
    <div class="btns" style="justify-content:center"><button id="pwBtn">Unlock</button></div>
  </div>

  <div class="wrap" id="app">
    <header>
      <div>
        <h1><span>Aira</span> Bot Control Center</h1>
        <div class="sub">Four tabs: Persona · AI · Chat Behavior · Settings — every change goes live instantly, no redeploy.</div>
      </div>
      <div class="btns" style="margin-top:0">
        <button class="ghost" id="reloadBtn">Reload</button>
        <button id="saveBtn">Save changes</button>
      </div>
    </header>

    <div class="warn hidden" id="noPwWarn">
      Warning: <code>ADMIN_PASSWORD</code> is not set — anyone with this URL can edit your bot. Add it in Vercel → Settings → Environment Variables.
    </div>

    <nav class="tabs">
      <button class="tab active" data-tab="persona">Persona</button>
      <button class="tab" data-tab="ai">AI &amp; Replies</button>
      <button class="tab" data-tab="chat">Chat Behavior</button>
      <button class="tab" data-tab="settings">Settings</button>
    </nav>

    <section class="pane" data-pane="persona">
      <div class="card">
        <h2>Who she is</h2>
        <label>Bot name</label>
        <input type="text" id="botName" maxlength="60" />
        <label>System persona / character prompt</label>
        <textarea id="persona"></textarea>
        <label>Extra instructions (optional)</label>
        <textarea id="extraInstructions" style="min-height:70px" placeholder="e.g. Always reply in English, never use more than 2 sentences..."></textarea>
        <div class="sub" style="margin-top:14px">Current mood: <b id="moodNow" style="color:var(--text)">—</b></div>
      </div>
    </section>

    <section class="pane hidden" data-pane="ai">
      <div class="card">
        <h2>AI engine</h2>
        <label>NVIDIA model id</label>
        <input type="text" id="model" list="modelList" />
        <datalist id="modelList">
          <option value="openai/gpt-oss-20b"></option>
          <option value="openai/gpt-oss-120b"></option>
          <option value="deepseek-ai/deepseek-v4.1-flash"></option>
          <option value="meta/llama-3.3-70b-instruct"></option>
        </datalist>
        <label>Temperature: <b id="tempVal">0.85</b> <span style="color:var(--muted)">(lower = calmer, higher = wilder)</span></label>
        <input type="range" id="temperature" min="0" max="2" step="0.05" />
        <div class="row">
          <div>
            <label>Reply length</label>
            <select id="replyLength">
              <option value="short">Short (1-2 sentences)</option>
              <option value="medium">Medium</option>
              <option value="long">Long &amp; detailed</option>
            </select>
          </div>
          <div>
            <label>Max tokens: <b id="maxTokensVal">280</b></label>
            <input type="range" id="maxTokens" min="16" max="1000" step="10" />
          </div>
        </div>
        <div class="inline">
          <input type="checkbox" id="emojis" style="width:auto" />
          <span style="font-size:13px;color:var(--muted)">Use emojis in replies</span>
        </div>
        <label>AI timeout: <b id="aiTimeoutVal">30s</b> <span style="color:var(--muted)">(wait for the AI this long, then send the fallback)</span></label>
        <input type="range" id="aiTimeout" min="5" max="60" step="1" />
      </div>
    </section>

    <section class="pane hidden" data-pane="chat">
      <div class="card">
        <h2>Reading your messages</h2>
        <label>Before she reads your message</label>
        <select id="readDelayMode">
          <option value="random">Random delay (feels natural)</option>
          <option value="fixed">Fixed delay (precise)</option>
        </select>
        <div id="readRandom">
          <label>Random minimum: <b id="readDelayMinVal">1.0s</b></label>
          <input type="range" id="readDelayMin" min="0" max="30000" step="100" />
          <label>Random maximum: <b id="readDelayMaxVal">4.0s</b> <span style="color:var(--muted)">(a new random delay is picked for every message)</span></label>
          <input type="range" id="readDelayMax" min="0" max="30000" step="100" />
        </div>
        <div id="readFixed">
          <label>Exact delay: <b id="readDelayVal">2.0s</b> <span style="color:var(--muted)">(same delay every time)</span></label>
          <input type="range" id="readDelay" min="0" max="30000" step="100" />
        </div>
        <div class="toggle">
          <input type="checkbox" id="readLengthFactor" />
          <span>Add reading time for longer messages (takes time to actually read it)</span>
        </div>
        <label>Chance she gets distracted / busy: <b id="busyChanceVal">10%</b> <span style="color:var(--muted)">(adds a random 2-8s pause)</span></label>
        <input type="range" id="busyChance" min="0" max="50" step="1" />
      </div>

      <div class="card">
        <h2>Typing &amp; sending</h2>
        <div class="toggle" style="margin-top:0">
          <input type="checkbox" id="typingIndicator" />
          <span>Show "typing..." while she's writing</span>
        </div>
        <div class="toggle">
          <input type="checkbox" id="markSeen" />
          <span>Mark messages as seen (blue check)</span>
        </div>
        <label>Typing delay — minimum: <b id="minDelayVal">1.2s</b></label>
        <input type="range" id="minDelay" min="0" max="10000" step="100" />
        <label>Maximum: <b id="maxDelayVal">5.0s</b> <span style="color:var(--muted)">(longer replies take longer to "type")</span></label>
        <input type="range" id="maxDelay" min="0" max="30000" step="500" />
        <div class="toggle">
          <input type="checkbox" id="multiMessage" />
          <span>Send long replies as quick separate messages (like a real person)</span>
        </div>
        <label>Delay between split messages: <b id="splitDelayVal">1.5s</b></label>
        <input type="range" id="splitDelay" min="0" max="10000" step="100" />
        <div class="toggle">
          <input type="checkbox" id="moodAware" />
          <span>Mood &amp; availability (changes with time of day, slower late at night)</span>
        </div>
      </div>

      <div class="card">
        <h2>Fallback reply</h2>
        <label>Sent when the AI fails or times out</label>
        <textarea id="fallbackReply" style="min-height:70px"></textarea>
      </div>

      <div class="card">
        <h2>Test her now</h2>
        <div class="chat">
          <input type="text" id="testMsg" placeholder="Type a message..." />
          <button id="testBtn">Send</button>
        </div>
        <div class="bubble" id="testReply">Her reply will appear here. This uses your current (unsaved) settings.</div>
      </div>
    </section>

    <section class="pane hidden" data-pane="settings">
      <div class="card">
        <h2>How she replies right now</h2>
        <div class="summary" id="behaviorSummary"></div>
        <div class="sub" style="margin-top:12px">Webhook: <code id="webhookUrlLine">—</code></div>
      </div>
      <div class="card">
        <h2>Connection status</h2>
        <div id="envBadges"></div>
      </div>
      <div class="card">
        <h2>Maintenance</h2>
        <div class="btns" style="margin-top:0">
          <button class="ghost" id="resetBtn">Reset everything to defaults</button>
        </div>
      </div>
    </section>

    <div class="foot" id="footInfo"></div>
  </div>

  <div class="toast" id="toast"></div>

<script>
  var pw = localStorage.getItem("adminPw") || "";
  var current = null;
  var envInfo = null;

  function $(id) { return document.getElementById(id); }

  function toast(msg, isErr) {
    var t = $("toast");
    t.textContent = msg;
    t.className = "toast show" + (isErr ? " err" : "");
    setTimeout(function() { t.className = "toast"; }, 2600);
  }

  function call(path, method, body) {
    return fetch(path, {
      method: method,
      headers: { "Content-Type": "application/json", "x-admin-password": pw },
      body: body ? JSON.stringify(body) : undefined
    }).then(function(r) {
      if (r.status === 401) { showLock(); throw new Error("Unauthorized"); }
      return r.json().then(function(j) {
        if (!r.ok) throw new Error(j.error || "Request failed");
        return j;
      });
    });
  }

  function showLock() { $("lock").classList.remove("hidden"); $("app").classList.add("hidden"); }
  function hideLock() { $("lock").classList.add("hidden"); $("app").classList.remove("hidden"); }

  function sec(ms) { return (Number(ms) / 1000).toFixed(1) + "s"; }

  function updateReadModeUI() {
    var fixed = $("readDelayMode").value === "fixed";
    $("readFixed").classList.toggle("hidden", !fixed);
    $("readRandom").classList.toggle("hidden", fixed);
  }

  function fill(s) {
    current = s;
    $("botName").value = s.botName;
    $("model").value = s.model;
    $("persona").value = s.persona;
    $("extraInstructions").value = s.extraInstructions || "";
    $("replyLength").value = s.replyLength;
    $("temperature").value = s.temperature;
    $("tempVal").textContent = s.temperature;
    $("maxTokens").value = s.maxTokens;
    $("maxTokensVal").textContent = s.maxTokens;
    $("emojis").checked = !!s.emojis;
    $("typingIndicator").checked = s.typingIndicator !== false;
    $("markSeen").checked = s.markSeen !== false;
    $("readDelayMode").value = s.readDelayMode === "fixed" ? "fixed" : "random";
    $("readDelay").value = s.readDelay != null ? s.readDelay : 2000;
    $("readDelayVal").textContent = sec($("readDelay").value);
    $("readDelayMin").value = s.readDelayMin != null ? s.readDelayMin : 1000;
    $("readDelayMinVal").textContent = sec($("readDelayMin").value);
    $("readDelayMax").value = s.readDelayMax != null ? s.readDelayMax : 4000;
    $("readDelayMaxVal").textContent = sec($("readDelayMax").value);
    updateReadModeUI();
    $("minDelay").value = s.minDelay != null ? s.minDelay : 1200;
    $("minDelayVal").textContent = sec($("minDelay").value);
    $("maxDelay").value = s.maxDelay != null ? s.maxDelay : 5000;
    $("maxDelayVal").textContent = sec($("maxDelay").value);
    $("aiTimeout").value = s.aiTimeout != null ? s.aiTimeout : 15;
    $("aiTimeoutVal").textContent = $("aiTimeout").value + "s";
    $("fallbackReply").value = s.fallbackReply || "";
    $("multiMessage").checked = s.multiMessage !== false;
    $("splitDelay").value = s.splitDelay != null ? s.splitDelay : 1500;
    $("splitDelayVal").textContent = sec($("splitDelay").value);
    $("moodAware").checked = s.moodAware !== false;
    $("readLengthFactor").checked = s.readLengthFactor !== false;
    $("busyChance").value = s.busyChance != null ? s.busyChance : 10;
    $("busyChanceVal").textContent = $("busyChance").value + "%";
    renderSummary(s);
  }

  function renderSummary(s) {
    var read;
    if (s.readDelayMode === "fixed") {
      read = "waits exactly <b>" + sec(s.readDelay) + "</b> before she reads you";
    } else {
      read = "waits <b>" + sec(s.readDelayMin) + " - " + sec(s.readDelayMax) + "</b> (random) before she reads you";
    }
    if (s.readLengthFactor !== false) read += ", plus reading time for long messages";
    var lines = [];
    lines.push("<div>1. Reading &mdash; " + read + "</div>");
    lines.push("<div>2. Seen <b>" + (s.markSeen !== false ? "on" : "off") + "</b> &nbsp;&middot;&nbsp; typing dots <b>" + (s.typingIndicator !== false ? "on" : "off") + "</b></div>");
    lines.push("<div>3. Typing for <b>" + sec(s.minDelay) + " - " + sec(s.maxDelay) + "</b> (AI timeout " + (s.aiTimeout || 30) + "s)</div>");
    lines.push("<div>4. " + (s.multiMessage !== false
      ? "Long replies split into bubbles, <b>" + sec(s.splitDelay) + "</b> apart"
      : "One single message per reply") + "</div>");
    lines.push("<div>5. Mood <b>" + (s.moodAware !== false ? "on" : "off") + "</b> &nbsp;&middot;&nbsp; busy pauses <b>" + (s.busyChance != null ? s.busyChance : 10) + "%</b> &nbsp;&middot;&nbsp; fallback: <i>" + String(s.fallbackReply || "").slice(0, 60) + "</i></div>");
    $("behaviorSummary").innerHTML = lines.join("");
  }

  function readForm() {
    return {
      botName: $("botName").value.trim(),
      model: $("model").value.trim(),
      persona: $("persona").value,
      extraInstructions: $("extraInstructions").value,
      replyLength: $("replyLength").value,
      temperature: parseFloat($("temperature").value),
      maxTokens: parseInt($("maxTokens").value, 10),
      emojis: $("emojis").checked,
      typingIndicator: $("typingIndicator").checked,
      markSeen: $("markSeen").checked,
      readDelayMode: $("readDelayMode").value,
      readDelay: parseInt($("readDelay").value, 10),
      readDelayMin: parseInt($("readDelayMin").value, 10),
      readDelayMax: parseInt($("readDelayMax").value, 10),
      minDelay: parseInt($("minDelay").value, 10),
      maxDelay: parseInt($("maxDelay").value, 10),
      aiTimeout: parseInt($("aiTimeout").value, 10),
      fallbackReply: $("fallbackReply").value.trim(),
      multiMessage: $("multiMessage").checked,
      splitDelay: parseInt($("splitDelay").value, 10),
      moodAware: $("moodAware").checked,
      readLengthFactor: $("readLengthFactor").checked,
      busyChance: parseInt($("busyChance").value, 10)
    };
  }

  function renderEnv(env) {
    envInfo = env;
    var labels = {
      VERIFY_TOKEN: "VERIFY_TOKEN",
      PAGE_ACCESS_TOKEN: "PAGE_ACCESS_TOKEN",
      NVIDIA_API_KEY: "NVIDIA_API_KEY",
      BLOB_READ_WRITE_TOKEN: "Live config storage",
      ADMIN_PASSWORD: "Admin password"
    };
    var html = "";
    for (var k in labels) {
      var ok = !!env[k];
      html += '<span class="badge"><span class="dot ' + (ok ? "ok" : "bad") + '"></span>' +
        labels[k] + " " + (ok ? "set" : "missing") + "</span>";
    }
    $("envBadges").innerHTML = html;
    $("noPwWarn").classList.toggle("hidden", !!env.ADMIN_PASSWORD);
  }

  function load() {
    return call("/api/settings", "GET").then(function(data) {
      fill(data.settings);
      renderEnv(data.env);
      $("footInfo").textContent = "Webhook URL: " + location.origin + data.webhookPath;
      if ($("webhookUrlLine")) $("webhookUrlLine").textContent = location.origin + data.webhookPath;
      if (data.mood) $("moodNow").textContent = data.mood;
      hideLock();
    }).catch(function(e) {
      if (e.message !== "Unauthorized") toast(e.message, true);
    });
  }

  $("pwBtn").addEventListener("click", function() {
    pw = $("pwInput").value;
    localStorage.setItem("adminPw", pw);
    load();
  });
  $("pwInput").addEventListener("keydown", function(e) {
    if (e.key === "Enter") $("pwBtn").click();
  });

  $("saveBtn").addEventListener("click", function() {
    call("/api/settings", "PUT", { settings: readForm() }).then(function(d) {
      fill(d.settings);
      toast("Saved — live now");
    }).catch(function(e) { toast(e.message, true); });
  });

  $("reloadBtn").addEventListener("click", function() {
    load().then(function() { toast("Reloaded"); });
  });

  $("temperature").addEventListener("input", function() {
    $("tempVal").textContent = this.value;
  });
  $("maxTokens").addEventListener("input", function() {
    $("maxTokensVal").textContent = this.value;
  });
  $("minDelay").addEventListener("input", function() {
    $("minDelayVal").textContent = sec(this.value);
  });
  $("maxDelay").addEventListener("input", function() {
    $("maxDelayVal").textContent = sec(this.value);
  });
  $("readDelay").addEventListener("input", function() {
    $("readDelayVal").textContent = sec(this.value);
  });
  $("readDelayMin").addEventListener("input", function() {
    $("readDelayMinVal").textContent = sec(this.value);
  });
  $("readDelayMax").addEventListener("input", function() {
    $("readDelayMaxVal").textContent = sec(this.value);
  });
  $("readDelayMode").addEventListener("change", updateReadModeUI);
  $("aiTimeout").addEventListener("input", function() {
    $("aiTimeoutVal").textContent = this.value + "s";
  });
  $("splitDelay").addEventListener("input", function() {
    $("splitDelayVal").textContent = sec(this.value);
  });
  $("busyChance").addEventListener("input", function() {
    $("busyChanceVal").textContent = this.value + "%";
  });

  document.querySelectorAll(".tab").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var name = btn.getAttribute("data-tab");
      document.querySelectorAll(".tab").forEach(function(x) {
        x.classList.toggle("active", x === btn);
      });
      document.querySelectorAll(".pane").forEach(function(p) {
        p.classList.toggle("hidden", p.getAttribute("data-pane") !== name);
      });
      try { localStorage.setItem("airaTab", name); } catch (e) {}
    });
  });
  try {
    var savedTab = localStorage.getItem("airaTab");
    if (savedTab) {
      var savedBtn = document.querySelector('.tab[data-tab="' + savedTab + '"]');
      if (savedBtn) savedBtn.click();
    }
  } catch (e) {}

  $("resetBtn").addEventListener("click", function() {
    if (!confirm("Reset ALL settings back to defaults?")) return;
    call("/api/settings", "POST", { action: "reset" }).then(function(d) {
      fill(d.settings);
      toast("Reset to defaults");
    }).catch(function(e) { toast(e.message, true); });
  });

  $("testBtn").addEventListener("click", function() {
    var msg = $("testMsg").value || "Hey";
    $("testReply").textContent = "Thinking...";
    call("/api/settings", "POST", { action: "test", message: msg, settings: readForm() })
      .then(function(d) { $("testReply").textContent = d.reply; })
      .catch(function(e) { $("testReply").textContent = "Error: " + e.message; });
  });
  $("testMsg").addEventListener("keydown", function(e) {
    if (e.key === "Enter") $("testBtn").click();
  });

  load();
</script>
</body>
</html>`;
