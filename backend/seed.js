'use strict';

const { db, hashPassword } = require('./db');

/**
 * 幂等初始化示例数据：仅当 users 表为空时写入。
 * server.js 在启动时调用；也可单独执行 `node seed.js`。
 */
function seedIfEmpty(database = db) {
  const existing = database.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (existing > 0) {
    console.log('[seed] 检测到已有数据，跳过初始化');
    return false;
  }

  const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
  const passwordHash = hashPassword('demo1234');

  const run = database.transaction(() => {
    const insUser = database.prepare(
      'INSERT INTO users (username, password_hash, nickname, bio, skills, weekly_hours, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const insProject = database.prepare(
      'INSERT INTO projects (owner_id, title, intro, goal, progress, expected_outcome, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insRole = database.prepare(
      'INSERT INTO roles (project_id, name, skill_requirement, skills, capacity, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insMember = database.prepare(
      'INSERT INTO members (project_id, role_id, user_id, is_owner, joined_at) VALUES (?, ?, ?, ?, ?)'
    );
    const insApp = database.prepare(
      'INSERT INTO applications (project_id, role_id, applicant_id, reason, contribution, status, reject_reason, profile_snapshot, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    // ---------- 4 个测试账号（密码均为 demo1234） ----------
    const userDefs = [
      { username: 'alice', nickname: '艾丽', bio: '计算机专业大三，喜欢前端开发，做过两个课程项目。', skills: ['React', 'JavaScript', 'CSS'], weekly_hours: 10, created: hoursAgo(720) },
      { username: 'bob',   nickname: '鲍勃', bio: '后端方向，写过几个小工具，对数据库感兴趣。',       skills: ['Node.js', 'Express', 'SQLite'], weekly_hours: 15, created: hoursAgo(700) },
      { username: 'carol', nickname: '卡罗尔', bio: '设计与数据双修，喜欢做界面也喜欢做图表。',         skills: ['Figma', 'UI设计', 'Python'], weekly_hours: 8, created: hoursAgo(680) },
      { username: 'dave',  nickname: '戴夫', bio: '数据方向，正在学习数据可视化。',                   skills: ['Python', '数据分析', 'ECharts'], weekly_hours: 6, created: hoursAgo(660) },
    ];
    const ids = {};
    for (const u of userDefs) {
      const info = insUser.run(u.username, passwordHash, u.nickname, u.bio, JSON.stringify(u.skills), u.weekly_hours, u.created);
      ids[u.username] = Number(info.lastInsertRowid);
    }
    const user = (name) => userDefs.find((u) => u.username === name);
    const snapshot = (name) => {
      const u = user(name);
      return JSON.stringify({ nickname: u.nickname, bio: u.bio, skills: u.skills, weekly_hours: u.weekly_hours });
    };

    // ---------- 示例项目 1：招募中（含「单名额竞争」场景） ----------
    // 前端开发角色上限 2 人，已有 1 名成员（bob），仅剩 1 个名额；
    // carol 与 dave 各有一条待审核申请 —— 用于验证同时接受两人只能进一人。
    const p1 = Number(insProject.run(
      ids.alice, '校园二手交易平台',
      '面向校内同学的二手物品交易平台，支持发布闲置、搜索和联系卖家。',
      '做出一个可在校园内试用的二手交易 MVP。',
      '已完成需求梳理和页面原型，尚未开始编码。',
      '可运行的 Web 应用、部署文档和演示视频。',
      'RECRUITING', hoursAgo(72)
    ).lastInsertRowid);
    const p1Frontend = Number(insRole.run(p1, '前端开发', '熟悉基础 Web 开发，能独立完成页面。', JSON.stringify(['React', 'JavaScript']), 2, hoursAgo(72)).lastInsertRowid);
    const p1Backend = Number(insRole.run(p1, '后端开发', '了解 Node.js 和数据库基本操作。', JSON.stringify(['Node.js', 'SQLite']), 1, hoursAgo(72)).lastInsertRowid);
    insMember.run(p1, null, ids.alice, 1, hoursAgo(72));        // 发起人，不占名额
    insMember.run(p1, p1Frontend, ids.bob, 0, hoursAgo(48));    // 已加入的前端成员
    insApp.run(p1, p1Frontend, ids.bob, '有后端经验，也想练一练前端，想完整跟一次真实项目。', '负责交易列表页，每周投入 10 小时左右。', 'ACCEPTED', null, snapshot('bob'), hoursAgo(60), hoursAgo(48));
    insApp.run(p1, p1Frontend, ids.carol, '做过两个 React 课程项目，希望参与真实产品的开发流程。', '负责闲置列表和详情页的样式与交互，每周投入 8 小时。', 'PENDING', null, snapshot('carol'), hoursAgo(30), null);
    insApp.run(p1, p1Frontend, ids.dave, '前端基础扎实，想从数据方向之外了解前端协作方式。', '可以承担页面联调和样式优化。', 'PENDING', null, snapshot('dave'), hoursAgo(20), null);

    // ---------- 示例项目 2：暂停招募 ----------
    const p2 = Number(insProject.run(
      ids.bob, '读书打卡小程序',
      '帮助同学记录每日阅读时长的打卡小程序。',
      '上线一个可用的打卡工具，先在小范围同学中试用。',
      '后端接口和打卡主流程已完成，进入设计改版阶段。',
      '小程序体验版和使用说明。',
      'PAUSED', hoursAgo(120)
    ).lastInsertRowid);
    const p2Design = Number(insRole.run(p2, 'UI 设计', '有界面设计经验，熟悉 Figma。', JSON.stringify(['UI设计', 'Figma']), 1, hoursAgo(120)).lastInsertRowid);
    insMember.run(p2, null, ids.bob, 1, hoursAgo(120));         // 发起人
    insApp.run(p2, p2Design, ids.carol, '对打卡类产品很感兴趣，想参与界面设计。', '负责整体视觉方案和交互稿。', 'REJECTED', '本阶段优先考虑有小程序设计经验的同学。', snapshot('carol'), hoursAgo(100), hoursAgo(90));
    insApp.run(p2, p2Design, ids.dave, '想尝试设计方向。', '可以帮忙整理设计素材。', 'WITHDRAWN', null, snapshot('dave'), hoursAgo(96), hoursAgo(80));
    insApp.run(p2, p2Design, ids.alice, '一直想做打卡类产品，对界面走查和文案也有兴趣。', '可以帮忙做界面走查和文案优化。', 'PENDING', null, snapshot('alice'), hoursAgo(50), null);

    // ---------- 示例项目 3：已满员 ----------
    const p3 = Number(insProject.run(
      ids.carol, '考研数据可视化',
      '把公开的考研数据整理成可视化图表，帮助同学择校。',
      '完成 10 所高校的分数线可视化。',
      '数据清洗完成 6 所，图表组件已搭好。',
      '可视化网站和数据说明文档。',
      'RECRUITING', hoursAgo(200)
    ).lastInsertRowid);
    const p3Data = Number(insRole.run(p3, '数据分析', '会 Python 数据处理，了解常见图表库。', JSON.stringify(['Python', '数据分析']), 1, hoursAgo(200)).lastInsertRowid);
    insMember.run(p3, null, ids.carol, 1, hoursAgo(200));       // 发起人
    insApp.run(p3, p3Data, ids.alice, '想参与数据可视化，之前做过报表相关的工作。', '负责一部分高校数据的清洗。', 'REJECTED', '名额已满，感谢关注。', snapshot('alice'), hoursAgo(160), hoursAgo(130));
    insApp.run(p3, p3Data, ids.dave, '一直做数据分析，想完整参与一次可视化项目。', '负责数据清洗和图表实现，每周投入 6 小时。', 'ACCEPTED', null, snapshot('dave'), hoursAgo(150), hoursAgo(140));
    insMember.run(p3, p3Data, ids.dave, 0, hoursAgo(140));      // 该角色唯一名额已被占用 → 项目满员

    console.log('[seed] 初始化完成：4 个测试账号（alice/bob/carol/dave，密码 demo1234）、3 个示例项目');
    console.log('[seed] 场景：项目1=招募中（前端开发仅剩 1 名额，carol/dave 待审核）；项目2=暂停招募；项目3=已满员');
  });

  run();
  return true;
}

if (require.main === module) {
  const created = seedIfEmpty();
  console.log(created ? '[seed] 已写入示例数据' : '[seed] 已有数据，未做任何修改');
}

module.exports = { seedIfEmpty };
