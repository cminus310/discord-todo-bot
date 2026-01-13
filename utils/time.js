// ====== 繁体 → 简体（只处理时间相关字）======
function normalizeChinese(text) {
    const map = {
      '點': '点',
      '後': '后',
      '無': '无',
      '沒': '没',
      '間': '间',
      '鐘': '钟',
    };
  
    return text.replace(/[點後無沒間鐘]/g, (c) => map[c] || c);
  }
  
  function parseHumanTime(input) {
    const TAIPEI_OFFSET = 8 * 60 * 60 * 1000;

    if (!input) return null;
  
    let text = input.trim().toLowerCase();
    text = normalizeChinese(text);
  
    // ====== 无时间 ======
    if (
      ['无', '没有', '不用', 'none', 'null'].includes(text)
    ) {
      return null;
    }
  
    const now = new Date();
  
    const endOfDay = (date) => {
      date.setHours(23, 59, 59, 999);
      return date.getTime();
    };
  
    // ====== 纯日期 ======
    if (text === '今天') return endOfDay(new Date());
    if (text === '明天') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return endOfDay(d) - TAIPEI_OFFSET;
    }
    if (text === '后天') {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      return endOfDay(d) - TAIPEI_OFFSET;
    }
  
    // ====== 今天 / 今晚 / 明天 + 时间 ======
    const cnTimeMatch = text.match(
      /^(今天|今晚|明天)(早上|上午|中午|下午|晚上)?(\d{1,2})(?:[:点](\d{1,2}))?$/
    );
  
    if (cnTimeMatch) {
      const [, dayWord, period, hourRaw, minuteRaw] = cnTimeMatch;
      const date = new Date();
  
      if (dayWord === '明天') date.setDate(date.getDate() + 1);
      if (dayWord === '今晚' && hour < 12) {hour += 12; };
  
      let hour = Number(hourRaw);
      let minute = minuteRaw ? Number(minuteRaw) : 0;
  
      if (period) {
        if (['下午', '晚上'].includes(period) && hour < 12) hour += 12;
        if (period === '中午' && hour < 11) hour += 12;
      }
  
      date.setHours(hour, minute, 0, 0);
      if (isNaN(date.getTime())) return null;
      return date.getTime() - TAIPEI_OFFSET;
    }
  
    // ====== 标准日期 ======
    const match = text.match(
      /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?$/
    );
  
    if (match) {
      const [, y, m, d, hh = '23', mm = '59'] = match;
      const date = new Date(
        Number(y),
        Number(m) - 1,
        Number(d),
        Number(hh),
        Number(mm),
        59,
        999
      );
  
      if (isNaN(date.getTime())) return null;
      return date.getTime() - TAIPEI_OFFSET;
    }
  
    return undefined; // 明确表示：解析失败
  }
  
  function formatTime(ts) {
    if (ts === null) return '—';
    const tsNumber = Number(ts)
    return new Date(tsNumber).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Taipei'
    });
  }
  
  module.exports = {
    parseHumanTime,
    formatTime,
  };
  