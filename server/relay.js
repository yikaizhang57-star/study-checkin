/**
 * 位置共享中继服务器
 *
 * 场景：A 在签到现场，B 不在。A 打开"分享我的位置"，B 输入房码连接，自动获取 A 的坐标。
 *
 * 用法:
 *   node server/relay.js              # 默认端口 3456
 *   node server/relay.js --port 8888  # 自定义端口
 *   node server/relay.js --token xxx  # 设置房间密码，防止陌生连接
 */

import { WebSocketServer } from 'ws';

const PORT = parseInt(process.argv[process.argv.indexOf('--port') + 1]) || 3456;
const ROOM_TOKEN = process.argv.includes('--token')
  ? process.argv[process.argv.indexOf('--token') + 1]
  : null;

const rooms = new Map(); // roomCode -> { sharer, receivers: Set<ws>, location: null }

const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

console.log(`位置共享中继服务器已启动: ws://0.0.0.0:${PORT}`);
console.log(`房间密码: ${ROOM_TOKEN || '无（任何人可连接）'}`);
console.log('---');

wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`[连接] ${clientIP}`);

  let clientRoom = null;
  let clientRole = null; // 'sharer' | 'receiver'

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', data: '无效的 JSON' }));
      return;
    }

    switch (msg.type) {
      // 分享者：创建房间，共享位置
      case 'share': {
        const { roomCode, latitude, longitude, address } = msg;
        if (ROOM_TOKEN && msg.token !== ROOM_TOKEN) {
          ws.send(JSON.stringify({ type: 'error', data: '房间密码错误' }));
          return;
        }
        if (!roomCode) {
          ws.send(JSON.stringify({ type: 'error', data: '缺少 roomCode' }));
          return;
        }
        if (!rooms.has(roomCode)) {
          rooms.set(roomCode, { sharer: null, receivers: new Set(), location: null });
        }
        const room = rooms.get(roomCode);
        if (room.sharer && room.sharer !== ws) {
          ws.send(JSON.stringify({ type: 'error', data: '该房间已有分享者' }));
          return;
        }
        room.sharer = ws;
        room.location = { latitude, longitude, address, updatedAt: Date.now() };
        clientRoom = roomCode;
        clientRole = 'sharer';
        ws.send(JSON.stringify({ type: 'ok', data: `房间 ${roomCode} 位置已共享 (${room.receivers.size} 个接收者)` }));

        // 把位置推送给所有接收者
        room.receivers.forEach((r) => {
          if (r.readyState === 1) {
            r.send(
              JSON.stringify({
                type: 'location_update',
                data: { latitude, longitude, address, from: 'sharer' },
              })
            );
          }
        });
        break;
      }

      // 接收者：加入房间，获取位置
      case 'join': {
        const { roomCode } = msg;
        if (ROOM_TOKEN && msg.token !== ROOM_TOKEN) {
          ws.send(JSON.stringify({ type: 'error', data: '房间密码错误' }));
          return;
        }
        if (!rooms.has(roomCode)) {
          ws.send(JSON.stringify({ type: 'error', data: '房间不存在' }));
          return;
        }
        const room = rooms.get(roomCode);
        room.receivers.add(ws);
        clientRoom = roomCode;
        clientRole = 'receiver';
        ws.send(JSON.stringify({ type: 'ok', data: `已加入房间 ${roomCode}` }));
        if (room.location) {
          ws.send(JSON.stringify({ type: 'location_update', data: { ...room.location, from: 'cache' } }));
        } else {
          ws.send(JSON.stringify({ type: 'waiting', data: '等待分享者发送位置...' }));
        }
        break;
      }

      // 分享者更新位置（实时追踪）
      case 'update_location': {
        if (clientRole !== 'sharer' || !clientRoom) {
          ws.send(JSON.stringify({ type: 'error', data: '你不是分享者' }));
          return;
        }
        const { latitude, longitude, address } = msg;
        const room = rooms.get(clientRoom);
        if (!room) break;
        room.location = { latitude, longitude, address, updatedAt: Date.now() };
        room.receivers.forEach((r) => {
          if (r.readyState === 1) {
            r.send(
              JSON.stringify({
                type: 'location_update',
                data: { latitude, longitude, address, from: 'sharer' },
              })
            );
          }
        });
        break;
      }

      // 心跳
      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }

      default: {
        ws.send(JSON.stringify({ type: 'error', data: `未知指令: ${msg.type}` }));
      }
    }
  });

  ws.on('close', () => {
    if (clientRoom && rooms.has(clientRoom)) {
      const room = rooms.get(clientRoom);
      if (clientRole === 'sharer') {
        room.sharer = null;
        // 通知接收者分享者已断开
        room.receivers.forEach((r) => {
          if (r.readyState === 1) {
            r.send(JSON.stringify({ type: 'notice', data: '分享者已断开连接' }));
          }
        });
      } else if (clientRole === 'receiver') {
        room.receivers.delete(ws);
      }
      // 如果房间无活跃连接，清理
      if (!room.sharer && room.receivers.size === 0) {
        rooms.delete(clientRoom);
        console.log(`[清理] 房间 ${clientRoom} 已销毁`);
      }
    }
    console.log(`[断开] ${clientIP} (${clientRole || '未认证'})`);
  });

  ws.on('error', (err) => {
    console.error(`[错误] ${clientIP}:`, err.message);
  });
});

// 定时清理过期房间（15分钟无活动）
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, code) => {
    if (room.location && now - room.location.updatedAt > 900000 && room.receivers.size === 0) {
      rooms.delete(code);
      console.log(`[过期] 房间 ${code} 已自动清理`);
    }
  });
}, 60000);

console.log('按 Ctrl+C 停止服务器');
