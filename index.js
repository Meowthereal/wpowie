require('dotenv').config();

const { Client, GatewayIntentBits, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');

const PREFIX = 'M';
const ADMIN_ID = '1110447469638197371';
const DEFAULT_BG = 'https://i.imgur.com/znaysLg.png';
const DEATH_COOLDOWN = 2 * 60 * 1000; // 2 minutes before a dead player can refight

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});
const users = new Map();
let activeBoss = null;
const fights = new Map();
const recentCommands = new Map(); // Prevent duplicate command execution
const skillPool = [
  { name: 'Swift Strike', rarity: 'Common', type: 'Damage', power: 12, emoji: '🗡️', desc: 'A quick slash attack.' },
  { name: 'Healing Pulse', rarity: 'Common', type: 'Heal', power: 10, emoji: '💖', desc: 'Restore a small amount of HP.' },
  { name: 'Lucky Swipe', rarity: 'Rare', type: 'Damage', power: 22, emoji: '🍀', desc: 'A strike with a chance to crit.' },
  { name: 'Shield Aura', rarity: 'Rare', type: 'Buff', power: 5, emoji: '🛡️', desc: 'Raise defense for the next hunt.' },
  { name: 'Flame Burst', rarity: 'Epic', type: 'Damage', power: 38, emoji: '🔥', desc: 'Blast enemies with fire.' },
  { name: 'Spirit Heal', rarity: 'Epic', type: 'Heal', power: 32, emoji: '✨', desc: 'Heal a strong amount of HP.' },
  { name: 'Demon Form', rarity: 'Legendary', type: 'Damage', power: 60, emoji: '😈', desc: 'Unleash demonic power to devastate foes.' },
  { name: 'Angel Blessing', rarity: 'Legendary', type: 'Buff', power: 0, emoji: '😇', desc: 'Greatly boost healing and luck.' },
  { name: 'Void Breaker', rarity: 'Universal', type: 'Damage', power: 90, emoji: '🌌', desc: 'A forbidden space-rending strike. Ignores 40% defense, applies Fracture (3 turns), 25% silence chance. Execute if target <25% HP. Drawback: user loses HP or 2-turn cooldown.' },
  { name: 'Angels Rage', rarity: 'Universal', type: 'Damage', power: 88, emoji: '😇', desc: 'A divine burst of judgment that heals user and grants a Divine Shield. 30% blind chance; stronger when user HP is low. Kills grant extra turn.' },
  { name: 'Dragon Emperor', rarity: 'Legendary', type: 'Damage', power: 70, emoji: '🐉', desc: 'Heavy fire damage to 1–3 enemies, applies Burn (3 turns), 20% chance Fear (attack down).' },
  { name: 'Blood Reaper', rarity: 'Legendary', type: 'Damage', power: 68, emoji: '🩸', desc: 'High dark damage to 1 target, lifesteal and applies Bleed (3 turns).' },
  { name: 'Storm Monarch', rarity: 'Legendary', type: 'Damage', power: 66, emoji: '⚡', desc: 'Lightning strike with speed scaling, 30% stun, 20% chance extra turn.' },
  { name: 'Abyss Walker', rarity: 'Mythic', type: 'Damage', power: 85, emoji: '💀', desc: 'High dark damage and makes user untargetable next turn (Void Step). 25% dodge boost for 2 turns.' },
  { name: 'Celestial Archive', rarity: 'Mythic', type: 'Utility', power: 0, emoji: '📚', desc: 'Random elemental burst; steals one buff from enemy and restores some energy.' },
  { name: 'Phoenix Soul', rarity: 'Epic', type: 'Heal', power: 50, emoji: '🔥', desc: 'Moderate fire damage and significant heal. Once per battle survival effect.' },
  { name: 'Frostbound', rarity: 'Epic', type: 'Damage', power: 44, emoji: '❄️', desc: 'Ice damage with 40% freeze chance and slow for 2 turns.' },
  { name: 'Iron Guard', rarity: 'Rare', type: 'Buff', power: 0, emoji: '🛡️', desc: 'Reduce damage taken for 2–3 turns and reflect a small portion.' },
  { name: 'Venom Touch', rarity: 'Rare', type: 'Damage', power: 18, emoji: '☠️', desc: 'Poison damage over time and weakens enemy healing.' },
  { name: 'Quickstep', rarity: 'Rare', type: 'Buff', power: 0, emoji: '🏃', desc: 'Increase dodge rate and 20% chance to fully evade for 1 turn.' }
];

const huntList = [
  { name: 'Slime', emoji: '🟢', baseGold: 10, baseXp: 12, rarity: 'Common' },
  { name: 'Bug', emoji: '🐛', baseGold: 12, baseXp: 14, rarity: 'Common' },
  { name: 'Baby Demon', emoji: '😈', baseGold: 22, baseXp: 24, rarity: 'Rare' },
  { name: 'Baby Angel', emoji: '😇', baseGold: 24, baseXp: 26, rarity: 'Rare' }
];

const titleData = [
  { min: 1, title: 'Novice', boost: 'Luck +1' },
  { min: 5, title: 'Slime Slayer', boost: 'Drop chance +2%' },
  { min: 10, title: 'Warrior', boost: 'Damage +5' },
  { min: 15, title: 'Elite Hunter', boost: 'XP +10%' },
  { min: 20, title: 'Shadow Reaper', boost: 'Critical +5%' }
];

const shopItems = [
  { name: 'Emblem: Hunter', price: 800, desc: 'A cosmetic emblem to show your hunter status.' },
  { name: 'Minor Health Potion', price: 150, desc: 'Restore a small amount of HP when used.' },
  { name: 'Hunting Trap', price: 300, desc: 'Increase drop chance on next hunt by 5%.' }
];

function getTitle(level) {
  return [...titleData].reverse().find(t => level >= t.min) || titleData[0];
}

function xpToLevel(level) {
  return 100 + level * 35;
}

function ensureUser(id, username) {
  if (!users.has(id)) {
    const titleInfo = getTitle(1);
    users.set(id, {
      id,
      username,
      gold: 0,
      powerShards: 10,
      xp: 0,
      level: 1,
      hp: 100,
      maxHp: 100,
      title: titleInfo.title,
      boost: titleInfo.boost,
      skills: [],
      inventory: {},
      mail: [],
      hunts: 0,
      deadUntil: 0
    });
  }
  return users.get(id);
}

async function safeLoadImage(url) {
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

async function createProfileCard(user, avatarUrl) {
  const canvas = createCanvas(1000, 625);
  const ctx = canvas.getContext('2d');
  const bg = await safeLoadImage(DEFAULT_BG);

  // Background
  if (bg) ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
  else {
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Card box
  const padding = 40;
  const cardX = padding;
  const cardY = padding;
  const cardW = 920;
  const cardH = 545;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.strokeStyle = '#5dd3c7';
  ctx.lineWidth = 8;
  ctx.strokeRect(cardX, cardY, cardW, cardH);

  // Avatar area
  const avatarSize = 200;
  const avatarX = cardX + 30;
  const avatarY = cardY + 30;
  const avatar = await safeLoadImage(avatarUrl);
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  }

  // Layout vars for text
  const textX = avatarX + avatarSize + 40;
  const nameY = cardY + 95;
  const titleY = nameY + 36;
  const statsStartY = titleY + 42;
  const lineHeight = 36;

  // Username and title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText(user.username.toUpperCase(), textX, nameY);

  ctx.fillStyle = '#ffcc00';
  ctx.font = '26px sans-serif';
  ctx.fillText(`${user.title} • Lv ${user.level}`, textX, titleY);

  // XP bar with overlay text
  const xpText = `XP: ${user.xp}/${xpToLevel(user.level)}`;
  const barX = textX;
  const barWidth = cardX + cardW - textX - 30;
  const barHeight = 32;
  const barY = statsStartY - 18;
  const progress = Math.min(user.xp / xpToLevel(user.level), 1);

  ctx.fillStyle = '#333333';
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.fillStyle = '#6ee7b7';
  ctx.fillRect(barX, barY, barWidth * progress, barHeight);

  ctx.font = '28px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(xpText, barX + 16, barY + barHeight - 8);

  // Other stats below the XP bar
  let y = statsStartY + barHeight + 8;
  ctx.fillText(`🪙 Purrfect Coins: ${user.gold}`, textX, y);
  y += lineHeight;
  ctx.fillText(`💠 Power Shards: ${user.powerShards}`, textX, y);
  y += lineHeight;
  ctx.fillText(`⚡ Skills: ${user.skills.length}`, textX, y);
  y += lineHeight;
  ctx.fillText(`📦 Inventory: ${Object.keys(user.inventory).length}`, textX, y);

  // Recent skills and title boost at the bottom of the card
  ctx.fillStyle = '#d4d4d4';
  ctx.font = '20px sans-serif';
  const recentSkills = user.skills.slice(-4).map(s => `${s.emoji} ${s.name}`).join(' | ') || 'No skills yet';
  ctx.fillText(`Recent Skills: ${recentSkills}`, cardX + 20, cardY + cardH - 60);
  ctx.fillText(`Title Boost: ${user.boost}`, cardX + 20, cardY + cardH - 30);

  return canvas.toBuffer();
}

function weightedChoice(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let pick = Math.random() * total;
  for (const item of items) {
    pick -= item.weight;
    if (pick <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function rollSkill() {
  const rarity = weightedChoice([
    { weight: 60, value: 'Common' },
    { weight: 25, value: 'Rare' },
    { weight: 10, value: 'Epic' },
    { weight: 3, value: 'Legendary' },
    { weight: 1, value: 'Mythic' },
    { weight: 0.1, value: 'Universal' }
  ]);
  let pool = skillPool.filter(skill => skill.rarity === rarity);
  if (!pool.length) pool = skillPool; // fallback
  return pool[Math.floor(Math.random() * pool.length)];
}

function addXp(user, amount) {
  user.xp += amount;
  let leveled = false;
  while (user.xp >= xpToLevel(user.level)) {
    user.xp -= xpToLevel(user.level);
    user.level += 1;
    user.maxHp += 10;
    user.hp = Math.min(user.hp + 20, user.maxHp);
    user.gold += 20;
    if (user.level % 5 === 0) user.powerShards += 2;
    const titleInfo = getTitle(user.level);
    user.title = titleInfo.title;
    user.boost = titleInfo.boost;
    leveled = true;
  }
  return leveled;
}

function getRandomRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function addItemToUser(user, itemName) {
  if (!user.inventory[itemName]) user.inventory[itemName] = 0;
  user.inventory[itemName] += 1;
}

function getMentionId(arg) {
  return arg ? arg.replace(/[<@!>]/g, '') : null;
}

function findGuildChannel() {
  const guild = client.guilds.cache.first();
  if (!guild) return null;
  return guild.channels.cache.find(channel => channel.isTextBased() && channel.viewable && channel.guild);
}

function createBoss(type) {
  const bossTypes = {
    demon: {
      name: 'Arc Demon',
      emoji: '😈',
      desc: 'A terrifying lord of flame and shadows.',
      image: 'https://i.imgur.com/Ai4JSju.jpeg'
    },
    angel: {
      name: 'Arc Angel',
      emoji: '😇',
      desc: 'A radiant sentinel of divine light.',
      image: 'https://i.imgur.com/QRftc50.jpeg'
    },
    phoenix: {
      name: 'Arc Phoenix',
      emoji: '🔥',
      desc: 'A reborn flamebird that rises from ashes.',
      image: 'https://i.imgur.com/BJLDR6w.jpeg'
    }
  };
  const key = type?.toLowerCase() && bossTypes[type.toLowerCase()] ? type.toLowerCase() : (Math.random() < 0.5 ? 'demon' : 'angel');
  const chosen = bossTypes[key];
  const level = getRandomRange(30, 80);
  const hp = 200 + level * 15;
  const gold = 200 + level * 10;
  const xp = 150 + level * 8;
  const shards = level % 5 === 0 ? 3 : 1;
  return {
    name: chosen.name,
    emoji: chosen.emoji,
    desc: chosen.desc,
    image: chosen.image,
    type: key,
    level,
    hp,
    maxHp: hp,
    gold,
    xp,
    shards,
    resurrected: false
  };
}

const bossLoot = {
  demon: {
    title: { name: 'Lord of Shadows', chance: 0.02 },
    weapon: { name: "Hell's Blade", chance: 0.02 }
  },
  angel: {
    title: { name: 'Angels Blessing', chance: 0.05 },
    weapon: { name: 'Blessing of the Angels', chance: 0.05 }
  },
  phoenix: {
    title: { name: 'Burning Life', chance: 0.04 },
    weapon: { name: 'Sword of Life', chance: 0.04 }
  }
};

const bossSkills = {
  demon: [
    { name: 'Hellfire Swipe', min: 18, max: 35, desc: 'A blazing swipe searing flesh.' },
    { name: 'Shadow Rend', min: 24, max: 42, desc: 'Rends the target with shadowy claws.' },
    { name: 'Abyssal Roar', min: 12, max: 28, desc: 'A terrifying roar that deals moderate damage.' }
  ],
  angel: [
    { name: 'Radiant Pierce', min: 16, max: 34, desc: 'A focused spear of light.' },
    { name: 'Judgment Wave', min: 20, max: 38, desc: 'A wave of holy energy.' },
    { name: 'Celestial Gust', min: 10, max: 22, desc: 'A gust of wind imbued with light.' }
  ],
  phoenix: [
    { name: 'Flame Dive', min: 22, max: 40, desc: 'Dives in a shower of burning feathers.' },
    { name: 'Rebirth Blaze', min: 18, max: 34, desc: 'Engulfs foes in renewing flame.' },
    { name: 'Ember Wave', min: 12, max: 26, desc: 'A wave of embers that scorches.' }
  ]
};

function bossChooseSkill(type) {
  const pool = bossSkills[type] || [];
  return pool[Math.floor(Math.random() * pool.length)];
}

async function spawnBoss(channel, type) {
  if (activeBoss) {
    await channel.send('A boss is already active. Defeat it before spawning another.');
    return;
  }
  activeBoss = createBoss(type);
  const bossType = activeBoss.type || (activeBoss.name.toLowerCase().includes('demon') ? 'demon' : (activeBoss.name.toLowerCase().includes('angel') ? 'angel' : 'demon'));
  const drops = bossLoot[bossType];
  const dropText = `Title: ${drops.title.name} (${Math.round(drops.title.chance * 100)}%)\nWeapon: ${drops.weapon.name} (${Math.round(drops.weapon.chance * 100)}%)`;
  const bossEmbed = new EmbedBuilder()
    .setTitle(`${activeBoss.emoji} GLOBAL BOSS SPAWN`)
    .setDescription(`**${activeBoss.name}** has appeared! ${activeBoss.desc}`)
    .addFields(
      { name: 'Boss Level', value: `${activeBoss.level}`, inline: true },
      { name: 'Boss HP', value: `${activeBoss.hp}/${activeBoss.maxHp}`, inline: true },
      { name: 'Rewards', value: `Coins: ${activeBoss.gold}\nXP: ${activeBoss.xp}\nPower Shards: ${activeBoss.shards}` },
      { name: 'Possible Drops', value: dropText, inline: false }
    )
    .setColor('#f97316')
    .setTimestamp();
  if (activeBoss.image) {
    bossEmbed.setImage(activeBoss.image);
  }
  const fightRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('fight_boss').setLabel('Fight').setStyle(ButtonStyle.Danger)
  );
  await channel.send({ embeds: [bossEmbed], components: [fightRow] });
}

function buildCommandEmbed(isAdmin) {
  const embed = new EmbedBuilder()
    .setTitle('🎮 RPG Bot Command Menu')
    .setColor('#7c3aed')
    .setDescription('Use the prefix `M` followed by a command.')
    .addFields(
      { name: 'Player Commands', value: '`Mprofile`, `Mhunt`, `Mroll`, `Mroll10`, `Mskillroll`, `Mskillindex`, `Mshop`, `Mcmd`, `Mmailbox`', inline: false },
      { name: 'Boss Commands', value: '`Mfightboss`, `Mspawnboss` (admin only)', inline: false },
      { name: 'System', value: '`Mfusion skill1 skill2`', inline: false }
    );
  if (isAdmin) {
    embed.addFields({ name: 'Admin Commands', value: '`Mspawnboss`, `Mmail @user text`, `Mmailall text`, `Mgivecoins @user amount`, `Mgiveitem @user item`, `Mresetplayer @user`, `Mresetall`', inline: false });
  }
  return embed;
}

client.once('ready', () => {
  console.log('Logged in as ' + client.user.tag);
  const channel = findGuildChannel();
  if (channel) {
    setInterval(async () => {
      if (!activeBoss) {
        await spawnBoss(channel);
      }
    }, 10 * 60 * 1000);
  }
  // Cleanup old command timestamps periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, time] of recentCommands.entries()) {
      if (now - time > 60000) { // Remove entries older than 1 minute
        recentCommands.delete(key);
      }
    }
  }, 30000); // Cleanup every 30 seconds
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const user = ensureUser(message.author.id, message.author.username);
  const input = message.content.slice(PREFIX.length).trim();
  const args = input.split(/\s+/);
  const cmd = args.shift().toLowerCase();

  // Prevent duplicate command execution
  const cmdKey = `${message.author.id}:${cmd}:${message.id}`;
  const now = Date.now();
  if (recentCommands.has(cmdKey)) {
    return; // Already processed this message
  }
  recentCommands.set(cmdKey, now);

  try {
    switch (cmd) {
      case 'profile': {
        const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 256 });
        const buffer = await createProfileCard(user, avatarUrl);
        const attachment = new AttachmentBuilder(buffer, { name: 'profile-card.png' });
        await message.channel.send({ files: [attachment] });
        break;
      }
      case 'hunt': {
        const huntMessage = await message.channel.send('⚔️ Searching the wilderness...');
        const steps = ['⚔️ Searching..', '⚔️ Found!', '⚔️ Fighting...'];
        for (const step of steps) {
          await wait(1000);
          await huntMessage.edit(step).catch(() => {});
        }
        const hunt = huntList[Math.floor(Math.random() * huntList.length)];
        const rewardGold = getRandomRange(hunt.baseGold + user.level * 2, hunt.baseGold + user.level * 5);
        const rewardXp = getRandomRange(hunt.baseXp + user.level * 2, hunt.baseXp + user.level * 4);
        const shardDrop = Math.random() < 0.06; // low chance to find a Power Shard while hunting

        user.gold += rewardGold;
        user.hunts += 1;
        if (shardDrop) user.powerShards += 1;
        const leveled = addXp(user, rewardXp);
        const resultEmbed = new EmbedBuilder()
          .setTitle(`${hunt.emoji} Hunt Complete`)
          .setDescription(`You defeated **${hunt.name}**!`)
          .addFields(
            { name: 'Gold', value: `+${rewardGold}`, inline: true },
            { name: 'XP', value: `+${rewardXp}`, inline: true },
            { name: 'Power Shards', value: shardDrop ? '+1' : 'None', inline: true },
            { name: 'Total Hunts', value: `${user.hunts}`, inline: true }
          )
          .setColor('#22c55e')
          .setTimestamp();
        if (leveled) {
          resultEmbed.addFields({ name: 'LEVEL UP!', value: `You reached level ${user.level}!`, inline: false });
        }
        await huntMessage.edit({ content: null, embeds: [resultEmbed] }).catch(() => {});
        break;
      }
      case 'roll': {
        if (user.powerShards < 1) return message.reply('You need at least 1 Power Shard to roll.');
        user.powerShards -= 1;
        const skill = rollSkill();
        user.skills.push(skill);
        await message.channel.send({ embeds: [new EmbedBuilder()
          .setTitle('🎰 Skill Roll')
          .setDescription(`You rolled **${skill.emoji} ${skill.name}** (${skill.rarity})`)
          .addFields(
            { name: 'Type', value: skill.type, inline: true },
            { name: 'Power', value: `${skill.power}`, inline: true },
            { name: 'Description', value: skill.desc, inline: false }
          )
          .setColor('#f97316')] });
        break;
      }
      case 'roll10': {
        if (user.powerShards < 10) return message.reply('You need at least 10 Power Shards to roll 10 times.');
        user.powerShards -= 10;
        const results = [];
        for (let i = 0; i < 10; i += 1) {
          const skill = rollSkill();
          user.skills.push(skill);
          results.push(`${skill.emoji} **${skill.name}** (${skill.rarity})`);
        }
        await message.channel.send({ embeds: [new EmbedBuilder()
          .setTitle('🎰 Skill Roll x10')
          .setDescription(results.join('\n'))
          .setColor('#f97316')] });
        break;
      }
      case 'skillroll': {
        if (user.powerShards < 1) return message.reply('You need at least 1 Power Shard to roll.');
        user.powerShards -= 1;
        const skill = rollSkill();
        user.skills.push(skill);
        await message.channel.send({ embeds: [new EmbedBuilder()
          .setTitle('🎰 Skill Roll')
          .setDescription(`You rolled **${skill.emoji} ${skill.name}** (${skill.rarity})`)
          .addFields(
            { name: 'Type', value: skill.type || '—', inline: true },
            { name: 'Power', value: `${skill.power}`, inline: true },
            { name: 'Description', value: skill.desc || '—', inline: false }
          )
          .setColor('#f97316')] });
        break;
      }
      case 'skillindex': {
        const byRarity = {};
        for (const s of skillPool) {
          if (!byRarity[s.rarity]) byRarity[s.rarity] = [];
          byRarity[s.rarity].push(`${s.emoji || ''} **${s.name}** — ${s.desc}`);
        }
        const idxEmbed = new EmbedBuilder()
          .setTitle('📜 Skill Index')
          .setColor('#14b8a6')
          .setTimestamp();
        for (const rarity of Object.keys(byRarity)) {
          idxEmbed.addFields({ name: `${rarity}`, value: byRarity[rarity].slice(0, 15).join('\n') || 'None', inline: false });
        }
        await message.channel.send({ embeds: [idxEmbed] });
        break;
      }
      case 'shop':
      case 'shopv': {
        const shopEmbed = new EmbedBuilder()
          .setTitle('🛒 Game Shop')
          .setDescription('Available items for purchase')
          .setColor('#f59e0b')
          .setTimestamp();
        for (const item of shopItems) {
          shopEmbed.addFields({ name: `${item.name} — ${item.price} coins`, value: item.desc, inline: false });
        }
        await message.channel.send({ embeds: [shopEmbed] });
        break;
      }
      case 'inv': {
        const tab = 'items';
        const invEmbed = new EmbedBuilder()
          .setTitle(`${message.author.username}'s Inventory`)
          .setColor('#0ea5a4')
          .setTimestamp();
        const userInv = ensureUser(message.author.id, message.author.username);
        const itemsList = Object.keys(userInv.inventory).map(k => `${k} x${userInv.inventory[k]}`).join('\n') || 'No items';
        const titlesList = userInv.title ? `${userInv.title}` : 'No title';
        const skillsList = userInv.skills.length ? userInv.skills.map(s => `${s.emoji || ''} ${s.name} (${s.rarity})`).join('\n') : 'No skills';
        invEmbed.addFields({ name: 'Items', value: itemsList, inline: false });
        invEmbed.addFields({ name: 'Titles', value: titlesList, inline: false });
        invEmbed.addFields({ name: 'Skills', value: skillsList, inline: false });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('inv_items').setLabel('Items').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('inv_titles').setLabel('Titles').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('inv_skills').setLabel('Skills').setStyle(ButtonStyle.Secondary)
        );
        await message.channel.send({ embeds: [invEmbed], components: [row] });
        break;
      }
      case 'buy': {
        const itemQuery = args.join(' ').toLowerCase();
        if (!itemQuery) return message.reply('Usage: Mbuy item name');
        const normalize = s => s.toLowerCase().replace(/["]['’]/g, '');
        const found = shopItems.find(it => normalize(it.name) === itemQuery || normalize(it.name).includes(itemQuery) || itemQuery.includes(normalize(it.name)));
        if (!found) return message.reply('Item not found. Use Mshop to view available items.');
        if (user.gold < found.price) return message.reply('You do not have enough coins to buy that item.');
        user.gold -= found.price;
        const lname = found.name.toLowerCase();
        if (lname.includes('power shard pack')) {
          user.powerShards += 10;
          await message.reply(`You purchased **${found.name}** and received 10 Power Shards.`);
        } else if (lname.includes('power shard')) {
          user.powerShards += 1;
          await message.reply(`You purchased **${found.name}** and received 1 Power Shard.`);
        } else {
          addItemToUser(user, found.name);
          await message.reply(`You purchased **${found.name}** and it was added to your inventory.`);
        }
        break;
      }
      case 'spawnboss': {
        if (message.author.id !== ADMIN_ID) return message.reply('You do not have permission to spawn bosses.');
        await spawnBoss(message.channel, args[0]);
        break;
      }
      case 'fightboss': {
        if (!activeBoss) return message.reply('There is currently no active boss.');
        if (user.deadUntil && Date.now() < user.deadUntil) {
          const sec = Math.ceil((user.deadUntil - Date.now()) / 1000);
          return message.reply(`You are dead and cannot fight for another ${sec} seconds.`);
        }
        const damage = getRandomRange(15 + user.level * 2, 30 + user.level * 3);
        activeBoss.hp -= damage;
        const fightEmbed = new EmbedBuilder()
          .setTitle('⚔️ Boss Fight')
          .setDescription(`You hit **${activeBoss.name}** for **${damage}** damage.`)
          .addFields({ name: 'Boss HP', value: `${Math.max(activeBoss.hp, 0)}/${activeBoss.maxHp}` })
          .setColor('#ec4899');
        if (activeBoss.hp <= 0) {
          if (activeBoss.type === 'phoenix' && !activeBoss.resurrected) {
            activeBoss.resurrected = true;
            activeBoss.hp = Math.max(1, Math.floor(activeBoss.maxHp * 0.5));
            fightEmbed.setDescription(`${activeBoss.name} was slain but bursts into flame and returns with 50% HP!`);
            await message.channel.send({ embeds: [fightEmbed] });
            break;
          }

          user.gold += activeBoss.gold;
          addXp(user, activeBoss.xp);
          fightEmbed.setDescription(`You defeated **${activeBoss.name}**!`)
            .addFields(
              { name: 'Coins', value: `+${activeBoss.gold}`, inline: true },
              { name: 'Power Shards', value: `+${activeBoss.shards}`, inline: true },
              { name: 'XP', value: `+${activeBoss.xp}`, inline: true }
            );

          const bossType = activeBoss.type || (activeBoss.name.toLowerCase().includes('demon') ? 'demon' : (activeBoss.name.toLowerCase().includes('angel') ? 'angel' : 'demon'));
          const drops = bossLoot[bossType];
          const dropMessages = [];

          if (Math.random() < drops.title.chance) {
            user.title = drops.title.name;
            dropMessages.push(`Title obtained: **${drops.title.name}**`);
          }

          if (Math.random() < drops.weapon.chance) {
            addItemToUser(user, drops.weapon.name);
            dropMessages.push(`Weapon obtained: **${drops.weapon.name}**`);
          }

          if (Math.random() < 0.25) {
            user.powerShards += activeBoss.shards;
            dropMessages.push(`Power Shards obtained: +${activeBoss.shards}`);
          }

          if (dropMessages.length) {
            fightEmbed.addFields({ name: 'Boss Drops', value: dropMessages.join('\n'), inline: false });
          }

          activeBoss = null;
        } else {
          const bossType = activeBoss.type || (activeBoss.name.toLowerCase().includes('demon') ? 'demon' : (activeBoss.name.toLowerCase().includes('angel') ? 'angel' : 'demon'));
          const bskill = bossChooseSkill(bossType) || { name: 'Claw', min: 8, max: 18 };
          const bossDmg = getRandomRange(bskill.min + Math.floor(activeBoss.level / 3), bskill.max + Math.floor(activeBoss.level / 3));
          user.hp = Math.max(0, user.hp - bossDmg);
          fightEmbed.addFields({ name: `${activeBoss.name} used ${bskill.name}`, value: `It dealt **${bossDmg}** damage to ${user.username}.`, inline: false });
          if (user.hp <= 0) {
            user.deadUntil = Date.now() + DEATH_COOLDOWN;
            fightEmbed.addFields({ name: 'You Died', value: `You have been defeated and cannot fight for ${Math.ceil(DEATH_COOLDOWN / 1000)} seconds.`, inline: false });
            await message.channel.send(`<@${message.author.id}> died while fighting a boss.`);
          } else {
            fightEmbed.addFields({ name: 'Your HP', value: `${user.hp}/${user.maxHp}`, inline: true });
          }
        }
        await message.channel.send({ embeds: [fightEmbed] });
        break;
      }
      case 'mail': {
        if (message.author.id !== ADMIN_ID) return message.reply('Mail commands are admin-only.');
        const mention = message.mentions.users.first();
        const mailText = args.slice(mention ? 1 : 0).join(' ');
        if (!mention || !mailText) return message.reply('Usage: Mmail @user text');
        const recipient = ensureUser(mention.id, mention.username);
        recipient.mail.push({ from: message.author.username, text: mailText, date: new Date().toISOString() });
        await message.reply(`Mail sent to ${mention.tag}.`);
        break;
      }
      case 'mailall': {
        if (message.author.id !== ADMIN_ID) return message.reply('Mail commands are admin-only.');
        const messageText = args.join(' ');
        if (!messageText) return message.reply('Usage: Mmailall text');
        for (const player of users.values()) {
          player.mail.push({ from: message.author.username, text: messageText, date: new Date().toISOString() });
        }
        await message.reply('Mail delivered to all registered players.');
        break;
      }
      case 'mailbox': {
        if (!user.mail.length) return message.reply('Your mailbox is empty.');
        const mailEntries = user.mail.slice(-5).map((m, index) => `**${index + 1}.** From ${m.from}: ${m.text}`);
        await message.channel.send({ embeds: [new EmbedBuilder().setTitle('📬 Your Mailbox').setDescription(mailEntries.join('\n\n')).setColor('#2563eb')] });
        break;
      }
      case 'givecoins': {
        if (message.author.id !== ADMIN_ID) return message.reply('Admin only.');
        const mention = message.mentions.users.first();
        const amount = parseInt(args[mention ? 1 : 0], 10);
        if (!mention || isNaN(amount)) return message.reply('Usage: Mgivecoins @user amount');
        const recipient = ensureUser(mention.id, mention.username);
        recipient.gold += amount;
        await message.reply(`Gave ${amount} coins to ${mention.tag}.`);
        break;
      }
      case 'giveitem': {
        if (message.author.id !== ADMIN_ID) return message.reply('Admin only.');
        const mention = message.mentions.users.first();
        const itemName = args.slice(mention ? 1 : 0).join(' ');
        if (!mention || !itemName) return message.reply('Usage: Mgiveitem @user item');
        const recipient = ensureUser(mention.id, mention.username);
        addItemToUser(recipient, itemName);
        await message.reply(`Gave **${itemName}** to ${mention.tag}.`);
        break;
      }
      case 'resetplayer': {
        if (message.author.id !== ADMIN_ID) return message.reply('Admin only.');
        const mention = message.mentions.users.first();
        if (!mention) return message.reply('Usage: Mresetplayer @user');
        users.delete(mention.id);
        await message.reply(`Player ${mention.tag} data has been reset.`);
        break;
      }
      case 'resetall': {
        if (message.author.id !== ADMIN_ID) return message.reply('Admin only.');
        users.clear();
        activeBoss = null;
        await message.reply('All player data has been reset.');
        break;
      }
      case 'fusion': {
        if (args.length < 2) return message.reply('Usage: Mfusion skill1 skill2');
        const [firstName, secondName] = args;
        const firstIndex = user.skills.findIndex(skill => skill.name.toLowerCase() === firstName.toLowerCase());
        const secondIndex = user.skills.findIndex(skill => skill.name.toLowerCase() === secondName.toLowerCase());
        if (firstIndex < 0 || secondIndex < 0) return message.reply('You must own both skills to fuse them.');
        const firstSkill = user.skills[firstIndex];
        const secondSkill = user.skills[secondIndex];
        const levels = ['Common', 'Rare', 'Epic', 'Legendary', 'Universal'];
        const maxIndex = Math.max(levels.indexOf(firstSkill.rarity), levels.indexOf(secondSkill.rarity));
        const fusedRarity = levels[Math.min(levels.length - 1, maxIndex + 1)];
        const fusedSkill = {
          name: `${firstSkill.name} ${secondSkill.name}`,
          rarity: fusedRarity,
          type: 'Fusion',
          power: firstSkill.power + secondSkill.power + 10,
          emoji: '🔶',
          desc: `A fused ability from ${firstSkill.name} and ${secondSkill.name}.`
        };
        user.skills.splice(Math.max(firstIndex, secondIndex), 1);
        user.skills.splice(Math.min(firstIndex, secondIndex), 1);
        user.skills.push(fusedSkill);
        await message.reply(`Fusion successful! Created **${fusedSkill.name}** (${fusedSkill.rarity}).`);
        break;
      }
      case 'cmd':
      case 'menu': {
        await message.channel.send({ embeds: [buildCommandEmbed(message.author.id === ADMIN_ID)] });
        break;
      }
      default:
        await message.reply('Unknown command. Use `Mcmd` to see the command menu.');
        break;
    }
  } catch (error) {
    console.error(error);
    await message.reply('An error occurred while processing your command.');
  }
});

const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN_HERE';
if (token === 'YOUR_BOT_TOKEN_HERE') {
  console.warn('No bot token is set. Add DISCORD_BOT_TOKEN or DISCORD_TOKEN to your .env file.');
}

client.login(token).catch(error => {
  console.error('Login failed:', error.message || error);
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isButton() && interaction.customId === 'fight_boss') {
      if (!activeBoss) return interaction.reply({ content: 'There is no active boss right now.', ephemeral: true });
      const user = ensureUser(interaction.user.id, interaction.user.username);
      if (user.deadUntil && Date.now() < user.deadUntil) {
        const sec = Math.ceil((user.deadUntil - Date.now()) / 1000);
        return interaction.reply({ content: `You are dead and cannot fight for another ${sec} seconds.`, ephemeral: true });
      }
      const skillOptions = [];
      skillOptions.push({ label: 'Basic Attack', description: 'Standard hit', value: 'basic' });
      for (let i = 0; i < user.skills.length; i += 1) {
        const s = user.skills[i];
        const label = `${s.emoji ? s.emoji + ' ' : ''}${s.name}`.slice(0, 100);
        const desc = (s.rarity || '').slice(0, 100);
        skillOptions.push({ label, description: desc, value: `skill:${i}` });
      }
      for (const invName of Object.keys(user.inventory)) {
        const match = skillPool.find(sp => sp.name.toLowerCase() === invName.toLowerCase());
        if (match) {
          const already = user.skills.find(s => s.name.toLowerCase() === match.name.toLowerCase());
          if (!already) {
            const label = `${match.emoji ? match.emoji + ' ' : ''}${match.name} (Inv)`.slice(0, 100);
            skillOptions.push({ label, description: match.rarity || '', value: `inv:${encodeURIComponent(match.name)}` });
          }
        }
      }
      const select = new StringSelectMenuBuilder()
        .setCustomId('select_skill')
        .setPlaceholder('Choose a skill to use')
        .addOptions(skillOptions.slice(0, 25));

      const row1 = new ActionRowBuilder().addComponents(select);
      const attackBtn = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('attack_boss').setLabel('Attack').setStyle(ButtonStyle.Primary)
      );
      fights.set(interaction.user.id, { selected: 'basic' });
      await interaction.reply({ content: `Prepare to fight **${activeBoss.name}**. Choose a skill and press Attack.`, components: [row1, attackBtn], ephemeral: true });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_skill') {
      const sel = interaction.values[0];
      const state = fights.get(interaction.user.id) || {};
      state.selected = sel;
      fights.set(interaction.user.id, state);
      let name = 'Selected Skill';
      if (sel === 'basic') name = 'Basic Attack';
      else if (sel.startsWith('skill:')) {
        const idx = Number(sel.split(':')[1]);
        name = ensureUser(interaction.user.id, interaction.user.username).skills[idx]?.name || name;
      } else if (sel.startsWith('inv:')) {
        name = decodeURIComponent(sel.split(':').slice(1).join(':'));
      }
      await interaction.update({ content: `Selected **${name}**. Press Attack when ready.`, components: interaction.message.components, embeds: interaction.message.embeds });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'attack_boss') {
      if (!activeBoss) return interaction.reply({ content: 'There is no active boss.', ephemeral: true });
      const user = ensureUser(interaction.user.id, interaction.user.username);
      if (user.deadUntil && Date.now() < user.deadUntil) {
        const sec = Math.ceil((user.deadUntil - Date.now()) / 1000);
        return interaction.reply({ content: `You are dead and cannot fight for another ${sec} seconds.`, ephemeral: true });
      }
      const state = fights.get(interaction.user.id) || { selected: 'basic' };
      let damage = 0;
      if (state.selected && state.selected !== 'basic') {
        if (state.selected.startsWith('skill:')) {
          const idx = Number(state.selected.split(':')[1]);
          const skill = user.skills[idx];
          if (skill) damage = getRandomRange(Math.max(1, Math.floor(skill.power * 0.8)), Math.floor(skill.power * 1.2) + Math.floor(user.level * 0.5));
        } else if (state.selected.startsWith('inv:')) {
          const skillName = decodeURIComponent(state.selected.split(':').slice(1).join(':'));
          const skill = skillPool.find(s => s.name.toLowerCase() === skillName.toLowerCase());
          if (skill) damage = getRandomRange(Math.max(1, Math.floor(skill.power * 0.8)), Math.floor(skill.power * 1.2) + Math.floor(user.level * 0.5));
        }
        if (!damage) damage = getRandomRange(15 + user.level * 2, 30 + user.level * 3);
      } else {
        damage = getRandomRange(15 + user.level * 2, 30 + user.level * 3);
      }

      activeBoss.hp -= damage;
      const fightEmbed = new EmbedBuilder()
        .setTitle('⚔️ Boss Fight')
        .setDescription(`${interaction.user.username} hit **${activeBoss.name}** for **${damage}** damage.`)
        .addFields({ name: 'Boss HP', value: `${Math.max(activeBoss.hp, 0)}/${activeBoss.maxHp}` })
        .setColor('#ec4899')
        .setTimestamp();

      if (activeBoss.hp <= 0) {
        if (activeBoss.type === 'phoenix' && !activeBoss.resurrected) {
          activeBoss.resurrected = true;
          activeBoss.hp = Math.max(1, Math.floor(activeBoss.maxHp * 0.5));
          fightEmbed.setDescription(`${activeBoss.name} was slain but bursts into flame and returns with 50% HP!`);
          await interaction.reply({ embeds: [fightEmbed], ephemeral: true });
          return;
        }

        user.gold += activeBoss.gold;
        addXp(user, activeBoss.xp);
        fightEmbed.setDescription(`You defeated **${activeBoss.name}**!`)
          .addFields(
            { name: 'Coins', value: `+${activeBoss.gold}`, inline: true },
            { name: 'Power Shards', value: `+${activeBoss.shards}`, inline: true },
            { name: 'XP', value: `+${activeBoss.xp}`, inline: true }
          );

        const bossType = activeBoss.type || (activeBoss.name.toLowerCase().includes('demon') ? 'demon' : (activeBoss.name.toLowerCase().includes('angel') ? 'angel' : 'demon'));
        const drops = bossLoot[bossType];
        const dropMessages = [];

        if (Math.random() < drops.title.chance) {
          user.title = drops.title.name;
          dropMessages.push(`Title obtained: **${drops.title.name}**`);
        }

        if (Math.random() < drops.weapon.chance) {
          addItemToUser(user, drops.weapon.name);
          dropMessages.push(`Weapon obtained: **${drops.weapon.name}**`);
        }

        if (Math.random() < 0.25) {
          user.powerShards += activeBoss.shards;
          dropMessages.push(`Power Shards obtained: +${activeBoss.shards}`);
        }

        if (dropMessages.length) {
          fightEmbed.addFields({ name: 'Boss Drops', value: dropMessages.join('\n'), inline: false });
        }

        activeBoss = null;
      } else {
        const bossType = activeBoss.type || (activeBoss.name.toLowerCase().includes('demon') ? 'demon' : (activeBoss.name.toLowerCase().includes('angel') ? 'angel' : 'demon'));
        const bskill = bossChooseSkill(bossType) || { name: 'Claw', min: 8, max: 18 };
        const bossDmg = getRandomRange(bskill.min + Math.floor(activeBoss.level / 3), bskill.max + Math.floor(activeBoss.level / 3));
        const targetUser = ensureUser(interaction.user.id, interaction.user.username);
        targetUser.hp = Math.max(0, targetUser.hp - bossDmg);
        fightEmbed.addFields({ name: `${activeBoss.name} used ${bskill.name}`, value: `It dealt **${bossDmg}** damage to ${interaction.user.username}.`, inline: false });
        if (targetUser.hp <= 0) {
          targetUser.deadUntil = Date.now() + DEATH_COOLDOWN;
          fightEmbed.addFields({ name: 'You Died', value: `You have been defeated and cannot fight for ${Math.ceil(DEATH_COOLDOWN / 1000)} seconds.`, inline: false });
          const publicChannel = interaction.channel || findGuildChannel();
          if (publicChannel && publicChannel.send) {
            try { await publicChannel.send(`<@${interaction.user.id}> died while fighting a boss.`); } catch {};
          }
        } else {
          fightEmbed.addFields({ name: 'Your HP', value: `${targetUser.hp}/${targetUser.maxHp}`, inline: true });
        }
      }

      await interaction.reply({ embeds: [fightEmbed], ephemeral: true });
      return;
    }

    if (interaction.isButton() && interaction.customId && interaction.customId.startsWith('inv_')) {
      const userInv = ensureUser(interaction.user.id, interaction.user.username);
      const tab = interaction.customId.split('_')[1];
      const invEmbed = new EmbedBuilder()
        .setTitle(`${interaction.user.username}'s Inventory`)
        .setColor('#0ea5a4')
        .setTimestamp();
      if (tab === 'items') {
        const itemsList = Object.keys(userInv.inventory).map(k => `${k} x${userInv.inventory[k]}`).join('\n') || 'No items';
        invEmbed.addFields({ name: 'Items', value: itemsList, inline: false });
      } else if (tab === 'titles') {
        invEmbed.addFields({ name: 'Titles', value: userInv.title || 'No title', inline: false });
      } else if (tab === 'skills') {
        const skillsList = userInv.skills.length ? userInv.skills.map(s => `${s.emoji || ''} ${s.name} (${s.rarity})`).join('\n') : 'No skills';
        invEmbed.addFields({ name: 'Skills', value: skillsList, inline: false });
      }
      await interaction.update({ embeds: [invEmbed], components: interaction.message.components });
      return;
    }
  } catch (err) {
    console.error('Interaction handler error:', err);
    if (interaction.replied || interaction.deferred) {
      try { await interaction.followUp({ content: 'An error occurred.', ephemeral: true }); } catch {};
    } else {
      try { await interaction.reply({ content: 'An error occurred.', ephemeral: true }); } catch {};
    }
  }
});
