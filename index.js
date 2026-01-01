// index.js
const { Client, GatewayIntentBits } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

// ================= 配置 =================
const TOKEN = process.env.DISCORD_TOKEN;
const TODO_CHANNEL_ID = process.env.TODO_CHANNEL_ID; // 设置你todo频道ID
if (!TOKEN || !TODO_CHANNEL_ID) {
  console.error('请先在环境变量里配置 DISCORD_TOKEN 和 TODO_CHANNEL_ID');
  process.exit(1);
}

// ================= 数据库 =================
const dbPath = path.join(__dirname, 'todos.db');
const db = new Database(dbPath);

db.prepare(`
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  content TEXT,
  priority TEXT DEFAULT '中',
  deadline TEXT,
  done INTEGER DEFAULT 0
)
`).run();

// ================= Bot 初始化 =================
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// 用户状态，用于交互式添加
const userStates = {};

// ================= 事件 =================
client.on('ready', () => {
  console.log(`${client.user.tag} 已上线`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return; // 忽略Bot自己
  if (message.channel.id !== TODO_CHANNEL_ID) return; // 只监听指定频道

  const userId = message.author.id;

  // -------- 交互式添加逻辑 --------
  if (userStates[userId]) {
    const state = userStates[userId];

    if (state.step === 'waiting_name') {
      state.tempTodo.content = message.content;
      state.step = 'waiting_deadline';
      return message.reply('⏰ 请告诉我截止日期 (YYYY-MM-DD)，或者输入“无”');
    }

    if (state.step === 'waiting_deadline') {
      state.tempTodo.deadline = message.content.toLowerCase() === '无' ? null : message.content;
      state.step = 'waiting_priority';
      return message.reply('⭐ 请设置优先级（高 / 中 / 低），默认中');
    }

    if (state.step === 'waiting_priority') {
      const priority = ['高','中','低'].includes(message.content) ? message.content : '中';
      state.tempTodo.priority = priority;

      // 保存到数据库
      db.prepare('INSERT INTO todos (user_id, content, priority, deadline) VALUES (?, ?, ?, ?)')
        .run(userId, state.tempTodo.content, state.tempTodo.priority, state.tempTodo.deadline);

      message.reply(`✅ 已添加 Todo: ${state.tempTodo.content} [优先: ${state.tempTodo.priority}]${state.tempTodo.deadline ? ` [截止: ${state.tempTodo.deadline}]` : ''}`);

      delete userStates[userId]; // 清除状态
      return;
    }
  }

  // -------- 用户触发交互 --------
  if (message.content === '添加') {
    userStates[userId] = { step: 'waiting_name', tempTodo: {} };
    return message.reply('📝 请告诉我任务名称：');
  }

  // -------- 查看列表 --------
  if (message.content === '列表') {
    const rows = db.prepare(`
      SELECT * FROM todos
      WHERE user_id=?
      ORDER BY done ASC,
        CASE priority WHEN '高' THEN 1 WHEN '中' THEN 2 ELSE 3 END,
        CASE WHEN deadline IS NULL THEN 999999 ELSE julianday(deadline) END
    `).all(userId);

    if (rows.length === 0) return message.reply('📭 你的 Todo 为空！');

    // 使用 Embed 显示
    const embed = {
      color: 0x0099ff,
      title: '📋 你的 Todo 列表',
      description: '按完成状态 → 优先级 → 截止日期排序',
      fields: rows.map(r => ({
        name: `${r.done ? '✅' : '⬜'} ${r.content}`,
        value: `ID: ${r.id} | 优先级: ${r.priority}${r.deadline ? ` | 截止: ${r.deadline}` : ''}`,
        inline: false
      })),
      timestamp: new Date(),
    };

    return message.reply({ embeds: [embed] });
  }

  // -------- 标记完成 --------
  if (message.content.startsWith('完成')) {
    const id = parseInt(message.content.split(' ')[1]);
    if (!id) return message.reply('❌ 格式: 完成 <ID>');

    const info = db.prepare('UPDATE todos SET done=1 WHERE id=? AND user_id=?').run(id, userId);
    if (info.changes === 0) return message.reply(`❌ 未找到 ID 为 ${id} 的待办`);
    return message.reply(`✅ 已标记 ID ${id} 为完成`);
  }

  // -------- 删除 --------
  if (message.content.startsWith('删除')) {
    const id = parseInt(message.content.split(' ')[1]);
    if (!id) return message.reply('❌ 格式: 删除 <ID>');

    const info = db.prepare('DELETE FROM todos WHERE id=? AND user_id=?').run(id, userId);
    if (info.changes === 0) return message.reply(`❌ 未找到 ID 为 ${id} 的待办`);
    return message.reply(`🗑 已删除 ID ${id}`);
  }
});

// ================= 登录 =================
client.login(TOKEN);
