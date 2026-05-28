import gpsSpoof from './api/gps-spoof.js';
import cxClient from './api/chaoxing.js';

// ---- DOM 引用 ----
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---- 状态 ----
const state = {
  loggedIn: false,
  relayWs: null,
  roomCode: null,
  connectedRoom: null,
  autoCheckin: false,
  gpsEnabled: false,
  targetLocation: null,
};

// ---- Toast 通知 ----
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.style.background =
    type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : type === 'warn' ? '#f39c12' : '#4A90D9';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

// ---- 日志 ----
function addLog(msg, level = 'info') {
  const list = $('#log-list');
  if (!list) return;
  const div = document.createElement('div');
  div.className = `log-item log-${level}`;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  list.prepend(div);
  while (list.children.length > 50) list.lastChild.remove();
}

// ---- UI 可见性 ----
function showCards(...ids) {
  ['login-section', 'location-panel', 'control-panel', 'checkin-section', 'log-section'].forEach((id) => {
    const el = $('#' + id);
    if (el) el.classList.toggle('hidden', !ids.includes(id));
  });
}

// ---- 坐标显示 ----
function updateCoordDisplay() {
  const t = gpsSpoof.getTarget();
  const val = $('#coord-value');
  if (val) {
    const addr = t.address || '未设置地址';
    val.textContent = `${t.latitude.toFixed(6)}, ${t.longitude.toFixed(6)} (${addr})`;
    state.targetLocation = t;
  }
}

// ---- 位置分享：接收模式 ----
async function joinRoom() {
  const serverUrl = $('#relay-server')?.value?.trim() || 'ws://127.0.0.1:3456';
  const roomCode = $('#room-code')?.value?.trim();

  if (!roomCode) {
    toast('请输入房码', 'error');
    return;
  }

  // 关闭旧连接
  if (state.relayWs) {
    state.relayWs.close();
    state.relayWs = null;
  }

  $('#receiver-status').textContent = '正在连接...';

  try {
    const ws = new WebSocket(serverUrl);
    state.relayWs = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', roomCode }));
      state.connectedRoom = roomCode;
      addLog(`已连接中继服务器，加入房间 ${roomCode}`);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      addLog(`[中继] ${msg.type}: ${JSON.stringify(msg.data)}`);

      if (msg.type === 'location_update') {
        const { latitude, longitude, address } = msg.data;
        // 自动应用收到的位置
        gpsSpoof.enable(latitude, longitude, address);
        updateCoordDisplay();
        $('#receiver-status').textContent =
          `收到位置: (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) ${address}`;
        toast('已接收并应用签到位置', 'success');
        addLog(`位置已更新: (${latitude}, ${longitude}) ${address}`);

        // 如果开启了自动签到且已登录，检测并签到
        if (state.autoCheckin && state.loggedIn) {
          detectAndSign();
        }
      } else if (msg.type === 'ok') {
        $('#receiver-status').textContent = msg.data;
      } else if (msg.type === 'waiting') {
        $('#receiver-status').textContent = msg.data;
      } else if (msg.type === 'error') {
        toast(msg.data, 'error');
        $('#receiver-status').textContent = '连接错误: ' + msg.data;
      } else if (msg.type === 'notice') {
        toast(msg.data, 'warn');
        $('#receiver-status').textContent = msg.data;
      }
    };

    ws.onerror = () => {
      $('#receiver-status').textContent = '连接失败，请确认服务器地址正确';
      toast('中继服务器连接失败', 'error');
    };

    ws.onclose = () => {
      $('#receiver-status').textContent = '已断开，点击"连接"重连';
      state.connectedRoom = null;
    };
  } catch (err) {
    $('#receiver-status').textContent = `连接错误: ${err.message}`;
  }
}

// ---- 位置分享：分享模式 ----
async function getRealLocation() {
  $('#sharer-status').textContent = '正在获取真实位置...';
  try {
    const pos = await gpsSpoof.getRealPosition();
    gpsSpoof.enable(pos.latitude, pos.longitude, '');
    updateCoordDisplay();
    $('#sharer-status').textContent =
      `已获取: (${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(6)})`;
    toast('已获取真实位置', 'success');
  } catch (err) {
    $('#sharer-status').textContent = '获取失败: ' + err.message;
    toast('获取位置失败，请确认 GPS 已开启', 'error');
  }
}

async function shareLocation() {
  const serverUrl = $('#relay-server')?.value?.trim() || 'ws://127.0.0.1:3456';
  const roomCode = $('#room-code')?.value?.trim();

  if (!roomCode) {
    toast('请输入房码', 'error');
    return;
  }

  const loc = gpsSpoof.getTarget();
  if (!loc.latitude || !loc.longitude) {
    toast('请先获取真实位置', 'error');
    return;
  }

  if (state.relayWs) {
    state.relayWs.close();
    state.relayWs = null;
  }

  try {
    const ws = new WebSocket(serverUrl);
    state.relayWs = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'share',
          roomCode,
          latitude: loc.latitude,
          longitude: loc.longitude,
          address: loc.address || '未知地址',
        })
      );
      state.connectedRoom = roomCode;
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      addLog(`[中继] ${msg.type}: ${JSON.stringify(msg.data)}`);
      if (msg.type === 'ok') {
        $('#sharer-status').textContent = msg.data;
        toast('位置已开始共享', 'success');
      } else if (msg.type === 'error') {
        toast(msg.data, 'error');
        $('#sharer-status').textContent = '错误: ' + msg.data;
      }
    };

    ws.onclose = () => {
      $('#sharer-status').textContent = '共享已断开';
      state.connectedRoom = null;
    };
  } catch (err) {
    toast('连接失败: ' + err.message, 'error');
  }
}

// ---- 签到检测与自动签到 ----
async function detectAndSign() {
  addLog('开始检测签到活动...');
  $('#checkin-status').innerHTML = '<p class="loading">正在检测签到活动...</p>';

  try {
    let found = false;
    for (const course of cxClient.courses) {
      const activity = await cxClient.getActiveCheckin(course);
      if (activity) {
        found = true;

        // 获取签到详情并提取目标坐标
        const detail = await cxClient.getPPTActiveInfo(activity.activeId);
        activity.detail = detail;
        activity.targetLocation = detail?._targetLocation || null;

        // 如果获取到了目标坐标，直接应用到 GPS 伪造
        if (activity.targetLocation) {
          const { latitude, longitude, address } = activity.targetLocation;
          gpsSpoof.enable(latitude, longitude, address);
          updateCoordDisplay();
          addLog(`从签到活动提取到目标坐标: (${latitude}, ${longitude}) ${address}`, 'success');
          toast(`已获取签到坐标: ${address}`, 'success');
        }

        addLog(`检测到签到: ${activity.name} (otherId=${activity.otherId})`, 'success');
        displayActivity(activity);

        if (state.autoCheckin) {
          await doAutoSign(activity);
        }
        break;
      }
    }

    if (!found) {
      $('#checkin-status').innerHTML = '<p class="loading">暂无活跃签到</p>';
      addLog('未检测到活跃签到');
    }
  } catch (err) {
    $('#checkin-status').innerHTML = `<p class="loading" style="color:#e74c3c;">检测出错: ${err.message}</p>`;
    addLog(`检测出错: ${err.message}`, 'error');
  }
}

function displayActivity(activity) {
  const typeNames = { 0: '普通/拍照签到', 2: '二维码签到', 3: '手势签到', 4: '位置签到', 5: '签到码签到' };
  const typeClass = { 0: 'general', 2: 'qrcode', 3: 'gesture', 4: 'location', 5: 'code' };
  const typeName = typeNames[activity.otherId] || '未知';
  const typeCls = typeClass[activity.otherId] || 'general';

  let extraHTML = '';
  if (activity.otherId === 4 && activity.targetLocation) {
    const tl = activity.targetLocation;
    extraHTML = `
      <div class="act-meta" style="color:#27ae60;margin-top:4px;">
        目标坐标: ${tl.latitude.toFixed(6)}, ${tl.longitude.toFixed(6)}
        ${tl.address ? ` (${tl.address})` : ''}
      </div>`;
  }

  $('#checkin-status').innerHTML = `
    <div class="activity-item">
      <div class="act-title">
        <span class="type-badge type-${typeCls}">${typeName}</span>
        ${activity.name}
      </div>
      <div class="act-meta">
        ${activity.courseName} | activeId: ${activity.activeId}
      </div>
      ${extraHTML}
    </div>
  `;
}

async function doAutoSign(activity) {
  addLog(`自动签到: ${activity.name} (otherId=${activity.otherId})`);

  try {
    // 预签到
    await cxClient.preSign(activity.activeId, activity.courseId, activity.classId);

    if (activity.otherId === 4) {
      // ---- 位置签到 ----
      // 优先级: 1) 活动自带坐标  2) GPS 伪造坐标  3) 手动输入坐标
      const actLoc = activity.targetLocation;
      const gpsLoc = gpsSpoof.getTarget();
      const loc = actLoc || (gpsLoc.latitude ? gpsLoc : null);

      if (!loc) {
        addLog('⚠️ 无法获取签到坐标 (活动未提供且未手动设置)', 'error');
        toast('请手动输入签到坐标', 'error');
        return;
      }

      const source = actLoc ? '(来自签到活动)' : '(来自手动设置)';
      addLog(`使用坐标 ${source}: (${loc.latitude}, ${loc.longitude}) ${loc.address || ''}`);

      const text = await cxClient.submitLocationSign(
        activity.activeId,
        loc.latitude,
        loc.longitude,
        loc.address || `${loc.latitude},${loc.longitude}`
      );
      if (text === 'success') {
        toast('位置签到成功!', 'success');
        addLog('✅ 位置签到成功', 'success');
      } else {
        toast(`签到结果: ${text}`, 'warn');
        addLog(`签到返回: ${text}`, 'warn');
      }
    } else if (activity.otherId === 0 || activity.otherId === 3 || activity.otherId === 5) {
      // 普通/手势/签到码
      const text = await cxClient.submitGeneralSign(
        activity.activeId,
        activity.courseId,
        activity.classId
      );
      if (text === 'success') {
        toast('签到成功!', 'success');
        addLog('✅ 签到成功', 'success');
      } else {
        toast(`签到结果: ${text}`, 'warn');
        addLog(`签到返回: ${text}`, 'warn');
      }
    } else {
      toast('当前签到类型不支持自动签到 (需要拍照/扫码)', 'warn');
      addLog('⚠️ 不支持的签到类型，需手动完成', 'warn');
    }
  } catch (err) {
    addLog(`签到出错: ${err.message}`, 'error');
    toast(`签到失败: ${err.message}`, 'error');
  }
}

// ---- 标签切换 ----
function setupTabs() {
  $('#loc-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    // 激活标签
    $$('#loc-tabs .tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    // 显示内容
    const mode = tab.dataset.mode;
    $$('.tab-content').forEach((c) => c.classList.add('hidden'));
    $(`#tab-${mode}`)?.classList.remove('hidden');
  });
}

// ---- 事件绑定 ----
function setupEvents() {
  // 登录
  $('#login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const username = $('#username').value.trim();
    const password = $('#password').value.trim();

    if (!username || !password) {
      toast('请输入账号和密码', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = '登录中...';

    try {
      await cxClient.login(username, password);
      state.loggedIn = true;
      toast('登录成功', 'success');
      addLog('登录成功');

      // 获取课程
      await cxClient.fetchCourses();
      cxClient.saveSession();

      showCards('location-panel', 'control-panel', 'checkin-section', 'log-section');
      $('#user-status').textContent = `已登录: ${cxClient.userInfo?.realname || username}`;
      updateCoordDisplay();
    } catch (err) {
      toast(err.message, 'error');
      addLog(`登录失败: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '登录';
    }
  });

  // GPS 伪造开关
  $('#toggle-gps')?.addEventListener('change', function () {
    state.gpsEnabled = this.checked;
    if (this.checked) {
      const loc = state.targetLocation || gpsSpoof.getTarget();
      if (loc.latitude && loc.longitude) {
        gpsSpoof.enable(loc.latitude, loc.longitude, loc.address);
      } else {
        gpsSpoof.enable(39.9042, 116.4074, '北京市');
      }
    } else {
      gpsSpoof.disable();
    }
    updateCoordDisplay();
    addLog(`GPS 伪造: ${this.checked ? '开启' : '关闭'}`);
  });

  // 自动签到开关
  $('#toggle-auto')?.addEventListener('change', function () {
    state.autoCheckin = this.checked;
    addLog(`自动签到: ${this.checked ? '开启' : '关闭'}`);
    if (this.checked) {
      toast('自动签到已开启，每10秒自动检测，发现签到自动完成', 'success');
      // 启动轮询 — 检测到签到活动后自动完成
      cxClient.onActivity = async (activity) => {
        addLog(`轮询检测到签到: ${activity.name}`, 'success');
        displayActivity(activity);
        await doAutoSign(activity);
      };
      cxClient.startPolling(10000);
    } else {
      cxClient.onActivity = null;
      cxClient.stopPolling();
    }
  });

  // 手动检测签到
  $('#btn-detect')?.addEventListener('click', detectAndSign);

  // 连接中继按钮
  $('#btn-connect-relay')?.addEventListener('click', () => {
    const mode = $('#loc-tabs')?.querySelector('.tab.active')?.dataset?.mode || 'receiver';
    addLog(`中继模式: ${mode}`);
  });

  // 接收模式 - 连接
  $('#btn-join')?.addEventListener('click', joinRoom);

  // 分享模式 - 获取位置
  $('#btn-get-real')?.addEventListener('click', getRealLocation);

  // 分享模式 - 分享
  $('#btn-share')?.addEventListener('click', shareLocation);

  // 手动输入 - 应用
  $('#btn-apply-manual')?.addEventListener('click', () => {
    const lat = parseFloat($('#manual-lat')?.value);
    const lon = parseFloat($('#manual-lon')?.value);
    const addr = $('#manual-addr')?.value?.trim() || '';

    if (isNaN(lat) || isNaN(lon)) {
      toast('请输入有效的经纬度', 'error');
      return;
    }

    gpsSpoof.enable(lat, lon, addr);
    state.targetLocation = { latitude: lat, longitude: lon, address: addr };
    updateCoordDisplay();
    toast(`坐标已应用: (${lat.toFixed(6)}, ${lon.toFixed(6)})`, 'success');
    addLog(`手动设置坐标: (${lat}, ${lon}) ${addr}`);
  });
}

// ---- 初始化 ----
function init() {
  setupTabs();
  setupEvents();
  updateCoordDisplay();

  // 尝试恢复会话
  const restored = cxClient.loadSession();
  if (restored) {
    state.loggedIn = true;
    showCards('location-panel', 'control-panel', 'checkin-section', 'log-section');
    $('#user-status').textContent = `已登录 (已恢复): ${cxClient.userInfo?.realname || ''}`;
    addLog('会话已恢复', 'success');
  } else {
    showCards('login-section');
  }

  addLog('应用已就绪');
}

init();

// ---- 全局导出 ----
window.__state = state;
window.__cx = cxClient;
window.__gps = gpsSpoof;
