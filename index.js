require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { parseHumanTime, formatTime } = require('./utils/time');
const {startReminder} = require('./utils/reminder')

const db = require('./database');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const COMMANDS = {
  HELP: ['help', '帮助', '幫助'],
  ADD: ['添加', 'add'],
  LIST: ['列表', 'list'],
  COMPLETE: ['完成', 'complete'],
  DELETE: ['删除', 'delete'],
  CANCEL: ['取消', 'cancel']
};

client.once('ready', () => {
  console.log(`${client.user.tag} is online`);
  startReminder(client,db)
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();
  const command = content.split(' ')[0];

  // ===== HELP 指令 =====
  if (COMMANDS.HELP.includes(command)) {
    const helpEmbed = new EmbedBuilder()
      .setTitle('📝 Todo Bot 帮助')
      .setColor(0x00ff00)
      .setDescription(`
**添加任务**: 发送 \`添加\`，Bot 会引导输入任务信息  
**查看列表**: 发送 \`列表\`  
**完成任务**: 发送 \`完成 <id>\`  
**删除任务**: 发送 \`删除 <id>\`  
**取消任务创建**: 在创建任务过程中发送 \`取消\`
    `);
    return message.channel.send({ embeds: [helpEmbed] });
  }

  // ===== 添加任务 =====
  let creating = false;
  if (COMMANDS.ADD.includes(command)) {
    creating = true;
    return collectTask(message);
  }

  // ===== 查看任务列表 =====
  if (COMMANDS.LIST.includes(command)) {
    const listEmbed = new EmbedBuilder()
      .setTitle('📝 当前任务列表')
      .setColor(0x0099ff);

      db.all(`
      SELECT
        ROW_NUMBER() OVER (ORDER BY id) AS row_number,
        name,
        deadline,
        priority,
        completed,
        created_at,
        completed_at
      FROM tasks
    `, [], (err, rows) => {
      if (err) return console.error(err);

      if (rows.length === 0) return message.channel.send('📭 当前任务列表为空');

      rows.forEach((t) => {
        listEmbed.addFields({
          name: `任务 #${t.row_number} ${t.name}`,
          value:
          `📅 创建时间：${formatTime(t.created_at)}\n` +
          `⏰ 截止时间：${formatTime(t.deadline)}\n` +
          `⚡ 优先级：${t.priority}\n` +
          `状态：${
            t.completed
              ? `✅ 已完成（${formatTime(t.completed_at)}）`
              : '❌ 未完成'
          }`,
        });
      });

      message.channel.send({ embeds: [listEmbed] });
    });
    return;
  }

 // ===== 完成任务 =====
  if (COMMANDS.COMPLETE.includes(command) && !creating) {
    const rowNumber = parseInt(content.split(' ')[1]);
    if (isNaN(rowNumber)) {
      return message.channel.send(`❌ 完成格式：完成 <任务#>`);
    }

    // 使用子查询来获取相应 row_number 的任务 ID
    db.get(`
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS row_number
        FROM tasks
      ) AS task_with_row
      WHERE row_number = ?`, [rowNumber], (err, row) => {
        if (err) return message.channel.send('❌ 查找任务失败');
        if (!row) return message.channel.send(`❌ 没有找到任务 #${rowNumber}`);

        const taskId = row.id;
        db.run(
          `UPDATE tasks
           SET completed = 1, completed_at = ?
           WHERE id = ?`,
          [now, taskId],
          function (err) {
            if (err) return message.channel.send('❌ 标记任务失败');
            return message.channel.send(`✅ 已完成任务 #${rowNumber}`);
          }
        );
      });
    // return;
  }



  // ===== 删除任务 =====
  if (COMMANDS.DELETE.includes(command) && !creating) {
    const rowNumber = parseInt(content.split(' ')[1]);
    if (isNaN(rowNumber)) {
      return message.channel.send(`❌ 删除格式：删除 <row_number>`);
    }

    // 使用 row_number 查找任务的实际 id
    db.get(`
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS row_number
        FROM tasks
      ) AS task_with_row
      WHERE row_number = ?`, [rowNumber], (err, row) => {
        if (err) return message.channel.send('❌ 查找任务失败');
        if (!row) return message.channel.send(`❌ 没有找到任务 #${rowNumber}`);
        const taskId = row.id;
        db.run(`DELETE FROM tasks WHERE id = ?`, [taskId], function (err) {
          if (err) return message.channel.send('❌ 删除任务失败');
        });

        return message.channel.send(`🗑️ 已删除任务 #${rowNumber}`);
      }
    );
    return;
  }

});

// ===== 交互式收集任务信息 =====
async function collectTask(message) {
  const filter = (m) => m.author.id === message.author.id;
  const channel = message.channel;

  try {
    // 1️⃣ 任务名称
    await channel.send('📝 请告诉我任务名称（发送 `取消` 可退出）：');
    const nameMsg = await channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
    if (nameMsg.first().content.toLowerCase() === '取消') return channel.send('❌ 任务创建已取消');
    const taskName = nameMsg.first().content;

    // 2️⃣ 截止日期
    await channel.send('📅 请告诉我截止日期（发送 `取消` 可退出）：');
    const deadlineMsg = await channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
    if (deadlineMsg.first().content.toLowerCase() === '取消') return channel.send('❌ 任务创建已取消');
    const deadline = deadlineMsg.first().content;
    const deadlineTs = parseHumanTime(deadline);
    if (deadlineTs === undefined) {
      return channel.send(
        '❌ 時間格式無法識別，例如：今晚11點 / 明天下午3點 / 2026-01-15 18:30 / 無'
      );
    }

    // 3️⃣ 优先级
    await channel.send('⚡ 请告诉我优先级（高、中、低）（发送 `取消` 可退出）：');
    const priorityMsg = await channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
    if (priorityMsg.first().content.toLowerCase() === '取消') return channel.send('❌ 任务创建已取消');
    const priority = priorityMsg.first().content;
    const now = Date.now();
    // 保存任务
    db.run(
      `INSERT INTO tasks (user, name, deadline, priority, completed, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [message.author.id, taskName, deadlineTs, priority, 0, now, null]
    );

    // 成功提示
    const embed = new EmbedBuilder()
      .setTitle('✅ 新任务已添加')
      .setColor(0x00ff00)
      .addFields(
        { name: '任务名称', value: taskName },
        { name: '截止日期', value: formatTime(deadlineTs) },
        { name: '优先级', value: priority }
      );

    return channel.send({ embeds: [embed] });
  } catch (err) {
    return channel.send('⏰ 超时未回复，任务创建已取消');
  }
}

client.login(process.env.DISCORD_TOKEN);
