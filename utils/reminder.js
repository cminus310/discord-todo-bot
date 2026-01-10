function startReminder(client, db) {
    const CHECK_INTERVAL = 60 * 1000; // 每分钟检查一次
    const REMIND_BEFORE = 30 * 60 * 1000; // 提前 30 分钟
  
    setInterval(() => {
      const now = Date.now();
  
      db.all(`
        SELECT id, user, name, deadline
        FROM tasks
        WHERE
          completed = 0
          AND deadline IS NOT NULL
          AND reminded = 0
          AND deadline <= ?
      `, [now + REMIND_BEFORE], async (err, rows) => {
        if (err || rows.length === 0) return;
  
        for (const task of rows) {
          try {
            const user = await client.users.fetch(task.user);
            await user.send(
              `🔔 **任务即将到期**\n` +
              `📌 ${task.name}\n` +
              `⏰ 截止时间：${new Date(task.deadline).toLocaleString('zh-TW')}`
            );
  
            db.run(
              `UPDATE tasks SET reminded = 1 WHERE id = ?`,
              [task.id]
            );
          } catch (e) {
            console.error('提醒失败:', e);
          }
        }
      });
    }, CHECK_INTERVAL);
  }
  
  module.exports = { startReminder };
  