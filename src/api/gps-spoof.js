/**
 * GPS 定位伪造模块
 *
 * 覆写浏览器 Geolocation API，使 WebView 中的定位请求返回指定坐标。
 * 在 Capacitor WebView 中生效，也支持普通浏览器。
 */

let spoofEnabled = false;
let targetLatitude = 39.9042;
let targetLongitude = 116.4074;
let targetAddress = '未设置';

// 保存原始 API
const _originalGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
const _originalWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);

/**
 * 构造伪造的 Position 对象
 */
function fakePosition(lat, lon) {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      altitude: null,
      accuracy: 5, // 高精度以通过验证
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  };
}

const gpsSpoof = {
  /** 开启伪造 */
  enable(lat, lon, addr) {
    if (lat != null) targetLatitude = lat;
    if (lon != null) targetLongitude = lon;
    if (addr != null) targetAddress = addr;
    spoofEnabled = true;

    navigator.geolocation.getCurrentPosition = function (success, error, options) {
      console.log(`[GPS伪造] getCurrentPosition -> (${targetLatitude}, ${targetLongitude})`);
      setTimeout(() => success(fakePosition(targetLatitude, targetLongitude)), 100);
    };

    navigator.geolocation.watchPosition = function (success, error, options) {
      console.log(`[GPS伪造] watchPosition -> (${targetLatitude}, ${targetLongitude})`);
      setTimeout(() => success(fakePosition(targetLatitude, targetLongitude)), 100);
      return 1; // fake watchId
    };

    console.log(`[GPS伪造] 已开启，目标: (${targetLatitude}, ${targetLongitude}) ${targetAddress}`);
  },

  /** 关闭伪造，恢复原始 API */
  disable() {
    spoofEnabled = false;
    navigator.geolocation.getCurrentPosition = _originalGetCurrentPosition;
    navigator.geolocation.watchPosition = _originalWatchPosition;
    console.log('[GPS伪造] 已关闭，恢复真实定位');
  },

  /** 是否开启 */
  isEnabled() {
    return spoofEnabled;
  },

  /** 获取当前伪造坐标 */
  getTarget() {
    return {
      latitude: targetLatitude,
      longitude: targetLongitude,
      address: targetAddress,
    };
  },

  /** 获取真实坐标（用原始 API 获取一次） */
  async getRealPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('设备不支持定位'));
        return;
      }
      // 临时恢复原始 API
      const orig1 = navigator.geolocation.getCurrentPosition;
      const orig2 = navigator.geolocation.watchPosition;
      navigator.geolocation.getCurrentPosition = _originalGetCurrentPosition;
      navigator.geolocation.watchPosition = _originalWatchPosition;

      _originalGetCurrentPosition(
        (pos) => {
          // 重新应用伪造
          if (spoofEnabled) {
            navigator.geolocation.getCurrentPosition = orig1;
            navigator.geolocation.watchPosition = orig2;
          }
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        (err) => {
          if (spoofEnabled) {
            navigator.geolocation.getCurrentPosition = orig1;
            navigator.geolocation.watchPosition = orig2;
          }
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  },
};

export default gpsSpoof;
