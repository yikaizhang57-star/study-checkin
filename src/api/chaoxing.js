/**
 * 学习通 API 客户端
 *
 * 核心流程:
 *   登录 -> 获取课程 -> 轮询检测签到活动 -> 预签到 -> 提交位置签到
 *
 * 签到类型 otherId:
 *   0 = 普通签到/拍照签到  2 = 二维码签到  3 = 手势签到
 *   4 = 位置签到          5 = 签到码签到
 */

// ---- API 端点 ----
const API = {
  LOGIN: 'https://passport2.chaoxing.com/fanyalogin',
  COURSES: 'https://mooc1-1.chaoxing.com/visit/courselistdata',
  ACTIVELIST: 'https://mobilelearn.chaoxing.com/v2/apis/active/student/activelist',
  PPTINFO: 'https://mobilelearn.chaoxing.com/v2/apis/active/getPPTActiveInfo',
  PRESIGN: 'https://mobilelearn.chaoxing.com/newsign/preSign',
  ANALYSIS: 'https://mobilelearn.chaoxing.com/pptSign/analysis',
  ANALYSIS2: 'https://mobilelearn.chaoxing.com/pptSign/analysis2',
  PPTSIGN: 'https://mobilelearn.chaoxing.com/pptSign/stuSignajax',
  CHAT_SIGN: 'https://mobilelearn.chaoxing.com/sign/stuSignajax',
};

// ---- 工具函数 ----
function cookieSerialize(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function cookieParse(str) {
  const map = {};
  str.split(';').forEach((p) => {
    const idx = p.indexOf('=');
    if (idx > 0) map[p.substring(0, idx).trim()] = p.substring(idx + 1).trim();
  });
  return map;
}

async function request(url, opts = {}) {
  const { headers = {}, body, ...rest } = opts;
  const res = await fetch(url, {
    ...rest,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      ...headers,
    },
    body,
    credentials: 'include',
  });
  return res;
}

// ---- 学习通客户端 ----
class ChaoxingClient {
  constructor() {
    this.cookies = {}; // { _uid, uf, _d, vc3, ... }
    this.uid = null;
    this.userInfo = null;
    this.courses = [];
    this.checkinTimer = null;
    this.onActivity = null; // 回调: (activity) => void
    this.onLog = null; // 回调: (msg, level) => void
  }

  log(msg, level = 'info') {
    console.log(`[学习通] ${msg}`);
    if (this.onLog) this.onLog(msg, level);
  }

  // ---- 登录 ----
  async login(username, password) {
    this.log('正在登录...');
    const body = new URLSearchParams();
    body.append('uname', username);
    body.append('password', password);
    body.append('t', 'true');
    body.append('fid', '-1');

    const res = await request(API.LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) throw new Error(`登录请求失败: HTTP ${res.status}`);

    // 提取 cookies
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const parts = setCookie.split(/,(?=\s*\S+=)/);
      parts.forEach((p) => {
        const m = p.match(/^([^=]+)=([^;]+)/);
        if (m) this.cookies[m[1].trim()] = m[2].trim();
      });
    }

    const data = await res.json();
    if (data.status === true || data.result === true || data.msg === 'success') {
      this.uid = data._uid || this.cookies._uid || username;
      this.cookies._uid = this.cookies._uid || this.uid;
      this.userInfo = data;
      this.log(`登录成功: ${data.realname || username}`, 'success');
      return data;
    }
    throw new Error(data.msg2 || data.msg || '登录失败，请检查账号密码');
  }

  // ---- 获取课程 ----
  async fetchCourses() {
    this.log('正在获取课程列表...');
    const res = await request(API.COURSES, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieSerialize(this.cookies),
      },
    });

    if (!res.ok) throw new Error(`获取课程失败: HTTP ${res.status}`);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`课程解析失败: ${text.substring(0, 200)}`);
    }

    this.courses = (data.channelList || []).map((c) => ({
      courseId: c.course?.data?.[0]?.id || c.key,
      classId: c.course?.data?.[0]?.classId || c.classId || c.course?.data?.[0]?.id,
      name:
        c.course?.data?.[0]?.name ||
        c.content?.course?.data?.[0]?.name ||
        c.name ||
        '未知课程',
      teacher: c.course?.data?.[0]?.teacherfactor || '',
    }));

    this.log(`获取到 ${this.courses.length} 门课程`, 'success');
    return this.courses;
  }

  // ---- 检测活跃签到活动 ----
  async getActiveCheckin(course) {
    const url = `${API.ACTIVELIST}?fid=0&courseId=${course.courseId}&classId=${course.classId}&_=${Date.now()}`;
    const res = await request(url, {
      headers: { Cookie: cookieSerialize(this.cookies) },
    });
    const data = await res.json();

    if (data.data && data.data.activeList && data.data.activeList.length > 0) {
      const active = data.data.activeList[0];
      const otherId = Number(active.otherId);
      const elapsed = (Date.now() - active.startTime) / 1000;

      if (otherId >= 0 && otherId <= 5 && active.status === 1 && elapsed < 7200) {
        return {
          activeId: active.id,
          name: active.nameOne,
          otherId,
          status: active.status,
          courseId: course.courseId,
          classId: course.classId,
          courseName: course.name,
          startTime: active.startTime,
        };
      }
    }
    return null;
  }

  // ---- 获取签到详细信息 ----
  async getPPTActiveInfo(activeId) {
    const res = await request(`${API.PPTINFO}?activeId=${activeId}`, {
      headers: { Cookie: cookieSerialize(this.cookies) },
    });
    const data = await res.json();
    const detail = data.data;

    // 从活动数据中提取老师设置的目标坐标（位置签到）
    if (detail) {
      detail._targetLocation = this.extractLocation(detail);
    }
    return detail;
  }

  /**
   * 从 ActivityDetail 中提取老师设置的签到目标坐标。
   *
   * 老师发布位置签到时设置的经纬度直接存在于 API 返回数据中：
   *   detail.latitude  — 目标纬度
   *   detail.longitude — 目标经度
   *
   * 地址信息可能存在于:
   *   configJson  — JSON 字符串，可能含 address/name/location 字段
   *   content     — 文字内容
   *   nameFour    — 签到名称（可能含地址）
   */
  extractLocation(detail) {
    if (!detail) return null;

    const lat = Number(detail.latitude);
    const lon = Number(detail.longitude);

    // 坐标无效（未设置或为默认值）
    if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) {
      return null;
    }

    // 尝试从 configJson 中提取地址描述
    let address = '';
    try {
      if (detail.configJson) {
        const cfg = typeof detail.configJson === 'string'
          ? JSON.parse(detail.configJson)
          : detail.configJson;
        // configJson 结构可能是 { locationText, address, name, ... }
        address = cfg.locationText || cfg.address || cfg.name || cfg.position || '';
      }
    } catch {
      /* configJson 可能不是 JSON */
    }

    // 备选地址来源
    if (!address) {
      address = detail.content || detail.nameFour || '';
    }

    // 如果还是没有地址，用坐标生成一个
    if (!address) {
      address = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    }

    this.log(`提取到签到目标坐标: (${lat}, ${lon}) ${address}`, 'success');
    return { latitude: lat, longitude: lon, address };
  }

  // ---- 预签到 + analysis ----
  async preSign(activeId, courseId, classId) {
    this.log('预签到...');
    const uid = this.uid || this.cookies._uid || '';

    // Step 1: preSign
    await request(
      `${API.PRESIGN}?courseId=${courseId}&classId=${classId}&activePrimaryId=${activeId}&general=1&sys=1&ls=1&appType=15&tid=&uid=${uid}&ut=s`,
      { headers: { Cookie: cookieSerialize(this.cookies) } }
    );

    // Step 2: analysis
    const aRes = await request(`${API.ANALYSIS}?vs=1&DB_STRATEGY=RANDOM&aid=${activeId}`, {
      headers: { Cookie: cookieSerialize(this.cookies) },
    });
    let code = '';
    const text = await aRes.text();
    const codeIdx = text.indexOf("code='+'");
    if (codeIdx > -1) {
      const start = codeIdx + 8;
      const sub = text.substring(start);
      const end = sub.indexOf("'");
      code = sub.substring(0, end);
    }

    if (code) {
      // Step 3: analysis2
      const a2Res = await request(`${API.ANALYSIS2}?DB_STRATEGY=RANDOM&code=${code}`, {
        headers: { Cookie: cookieSerialize(this.cookies) },
      });
      const a2Text = await a2Res.text();
      this.log(`analysis: ${a2Text}`);
    }

    // 等待 500ms
    await new Promise((r) => setTimeout(r, 500));
    this.log('预签到完成');
  }

  // ---- 提交位置签到 ----
  async submitLocationSign(activeId, latitude, longitude, address) {
    const uid = this.uid || this.cookies._uid || '';
    const encodedAddress = encodeURIComponent(address);
    const name = this.userInfo?.realname || '';

    const url =
      `${API.PPTSIGN}?name=${encodeURIComponent(name)}` +
      `&address=${encodedAddress}` +
      `&activeId=${activeId}` +
      `&uid=${uid}` +
      `&clientip=` +
      `&latitude=${latitude}` +
      `&longitude=${longitude}` +
      `&fid=0` +
      `&appType=15` +
      `&ifTiJiao=1`;

    this.log(`提交位置签到: (${latitude}, ${longitude}) ${address}`);
    const res = await request(url, {
      headers: { Cookie: cookieSerialize(this.cookies) },
    });
    const text = await res.text();
    this.log(`签到结果: ${text}`);
    return text;
  }

  // ---- 提交通用签到（普通/手势/签到码）----
  async submitGeneralSign(activeId, courseId, classId, name = '') {
    const uid = this.uid || this.cookies._uid || '';
    const url =
      `${API.PPTSIGN}?name=${encodeURIComponent(name || this.userInfo?.realname || '')}` +
      `&activeId=${activeId}` +
      `&uid=${uid}` +
      `&clientip=` +
      `&useragent=&fid=0` +
      `&appType=15` +
      `&ifTiJiao=1`;

    this.log(`提交通用签到: activeId=${activeId}`);
    const res = await request(url, {
      headers: { Cookie: cookieSerialize(this.cookies) },
    });
    const text = await res.text();
    this.log(`签到结果: ${text}`);
    return text;
  }

  // ---- 轮询检测签到 ----
  startPolling(intervalMs = 10000) {
    this.stopPolling();
    this.log(`开始轮询签到活动 (间隔 ${intervalMs / 1000}s)`);

    const poll = async () => {
      if (this.courses.length === 0) {
        try {
          await this.fetchCourses();
        } catch {
          /* 下次再试 */
        }
      }

      for (const course of this.courses) {
        try {
          const activity = await this.getActiveCheckin(course);
          if (activity && this.onActivity) {
            const detail = await this.getPPTActiveInfo(activity.activeId);
            activity.detail = detail;
            activity.targetLocation = detail?._targetLocation || null;
            this.onActivity(activity);
            return; // 发现一个就回调，不继续
          }
        } catch {
          /* 继续检查其他课程 */
        }
      }
    };

    // 立即执行一次
    poll();
    this.checkinTimer = setInterval(poll, intervalMs);
  }

  stopPolling() {
    if (this.checkinTimer) {
      clearInterval(this.checkinTimer);
      this.checkinTimer = null;
      this.log('已停止轮询');
    }
  }

  // ---- 保存/恢复会话 ----
  saveSession(key = 'default') {
    const session = {
      cookies: this.cookies,
      uid: this.uid,
      userInfo: this.userInfo,
      courses: this.courses,
      savedAt: Date.now(),
    };
    localStorage.setItem(`cx_session_${key}`, JSON.stringify(session));
    this.log('会话已保存');
  }

  loadSession(key = 'default') {
    try {
      const raw = localStorage.getItem(`cx_session_${key}`);
      if (raw) {
        const session = JSON.parse(raw);
        this.cookies = session.cookies || {};
        this.uid = session.uid;
        this.userInfo = session.userInfo;
        this.courses = session.courses || [];
        this.log(`会话已恢复 (${this.courses.length} 门课)`, 'success');
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }
}

// 单例
const cxClient = new ChaoxingClient();
export default cxClient;
export { ChaoxingClient };
