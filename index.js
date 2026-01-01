// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
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

// 存储任务的内存数组（可以换成数据库）

client.once('ready', () => {
  console.log(`${client.user.tag} is online`);
});



client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.author.bot) return;

  // 打印 debug 信息
  console.log('--- Debug Message ---');
  console.log('收到消息:', message.content);
  console.log('频道ID:', message.channel.id);
  console.log('用户ID:', message.author.id);
  console.log('用户名:', message.author.tag);
  console.log('-------------------');


  const content = message.content.trim().toLowerCase();
  const command = content.split('')[0];
  // ===== HELP 指令 =====
  if (COMMANDS.HELP.includes(command)) {
    const helpEmbed = new EmbedBuilder()
      .setTitle('📝 Todo Bot 帮助')
      .setColor(0x00ff00)
      .setDescription(`
**添加任务**: 发送 \`添加\`，Bot 会引导输入任务信息  
**查看列表**: 发送 \`列表\`  
**完成任务**: 发送 \`完成 序号\`  
**删除任务**: 发送 \`删除 序号\`  
**取消任务创建**: 在创建任务过程中发送 \`取消\`
    `);
    return message.channel.send({ embeds: [helpEmbed] });
  }

  // ===== 添加任务 =====
  let creating = false;
  if (COMMANDS.ADD.includes(command)) {
    creating = true
    return collectTask(message);
  }

  // ===== 查看任务列表 =====
  if (COMMANDS.LIST.includes(command)) {
    const listEmbed = new EmbedBuilder()
    .setTitle('📝 当前任务列表')
    .setColor(0x0099ff);
    db.all(`SELECT * FROM tasks WHERE user = ?`, [message.author.id], (err, rows) => {
      if (err) return console.error(err);
    
      if (rows.length === 0) return message.channel.send('📭 当前任务列表为空');
    
      rows.forEach((t, i) => {
        listEmbed.addFields({
          name: `#${t.id} ${t.name}`,
          value: `截止: ${t.deadline} | 优先级: ${t.priority} | 状态: ${t.completed ? '✅ 已完成' : '❌ 未完成'}`,
        });
      });
      message.channel.send({ embeds: [listEmbed] })
    });

    return ;
  }

  // ===== 完成任务 =====

  if (COMMANDS.COMPLETE.includes(command) && creating === false) {
    const taskId = parseInt(content.split(' ')[1]);
    if (isNaN(taskId)){
      return message.channel.send(`❌ 完成格式：完成 <id>`)
    }
    db.all(`SELECT * FROM tasks WHERE user = ?`, [message.author.id], (err, rows) => {
      if (err) return console.error(err);
      const userIndex = parseInt(content.split(' ')[1]) - 1;
      if (isNaN(userIndex) || !rows[userIndex]) return message.channel.send('❌ 无效的任务编号');
    
      db.run(`UPDATE tasks SET completed = 1 WHERE id = ?`, [taskId], function(err) {
        if (err) return message.channel.send('❌ 标记任务失败');
      });
    });
    return message.channel.send(`✅ 已标记任务 #${taskId} 为完成`);
  };

  // ===== 删除任务 =====
  if (COMMANDS.DELETE.includes(command) && creating === false) {
    const index = parseInt(content.split(' ')[1]);
    db.run(`DELETE FROM tasks WHERE id = ? AND user = ?`, [index, message.author.id],function(err){
      if(err) return message.channel.send('❌ 删除任务失败');
    });
    return message.channel.send(`🗑️ 已删除任务 #${index}`);
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

    // 3️⃣ 优先级
    await channel.send('⚡ 请告诉我优先级（高、中、低）（发送 `取消` 可退出）：');
    const priorityMsg = await channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
    if (priorityMsg.first().content.toLowerCase() === '取消') return channel.send('❌ 任务创建已取消');
    const priority = priorityMsg.first().content;

    // 保存任务
    db.run(
      `INSERT INTO tasks (user, name, deadline, priority, completed) VALUES (?, ?, ?, ?, ?)`,
      [message.author.id, taskName, deadline, priority, 0]
    );

    // 成功提示
    const embed = new EmbedBuilder()
      .setTitle('✅ 新任务已添加')
      .setColor(0x00ff00)
      .addFields(
        { name: '任务名称', value: taskName },
        { name: '截止日期', value: deadline },
        { name: '优先级', value: priority }
      );

    return channel.send({ embeds: [embed] });
  } catch (err) {
    return channel.send('⏰ 超时未回复，任务创建已取消');
  }
}

client.login(process.env.DISCORD_TOKEN);
