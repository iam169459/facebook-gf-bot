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
        <div class="sub">Customize everything below — changes are live instantly, no redeploy needed.</div>
      </div>
      <div class="btns" style="margin-top:0">
        <button class="ghost" id="reloadBtn">Reload</button>
        <button id="saveBtn">Save changes</button>
      </div>
    </header>

    <div class="warn hidden" id="noPwWarn">
      Warning: <code>ADMIN_PASSWORD</code> is not set — anyone with this URL can edit your bot. Add it in Vercel → Settings → Environment Variables.
    </div>

    <div class="card">
      <h2>Personality</h2>
      <div class="row">
        <div>
          <label>Bot name</label>
          <input type="text" id="botName" maxlength="60" />
        </div>
        <div>
          <label>NVIDIA model id</label>
          <input type="text" id="model" />
        </div>
      </div>
      <label>System persona / character prompt</label>
      <textarea id="persona"></textarea>
      <label>Extra instructions (optional)</label>
      <textarea id="extraInstructions" style="min-height:70px" placeholder="e.g. Always reply in English, never use more than 2 sentences..."></textarea>
    </div>

    <div class="card">
      <h2>Reply style</h2>
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
          <div class="inline">
            <input type="checkbox" id="emojis" style="width:auto" />
            <span style="font-size:13px;color:var(--muted)">Use emojis in replies</span>
          </div>
        </div>
      </div>
      <label>Temperature: <b id="tempVal">0.85</b> <span style="color:var(--muted)">(lower = calmer, higher = wilder)</span></label>
      <input type="range" id="temperature" min="0" max="2" step="0.05" />
    </div>

    <div class="card">
      <h2>Connection status</h2>
      <div id="envBadges"></div>
    </div>

    <div class="card">
      <h2>Test her now</h2>
      <div class="chat">
        <input type="text" id="testMsg" placeholder="Type a message..." />
        <button id="testBtn">Send</button>
      </div>
      <div class="bubble" id="testReply">Her reply will appear here. This uses your current (unsaved) settings.</div>
    </div>

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
      emojis: $("emojis").checked
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
