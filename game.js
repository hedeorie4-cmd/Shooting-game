const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const ammoEl = document.getElementById("ammo");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("status");

const FOV = Math.PI / 3;
const MAX_VIEW_DISTANCE = 50;
const worldSize = 40;

const state = {
  pointerLocked: false,
  running: false,
  score: 0,
  ammo: 30,
  timeLeft: 60,
  lastFrame: 0,
  keys: {},
  player: {
    x: 0,
    y: 1.6,
    z: 0,
    yaw: 0,
    speed: 8,
  },
  enemies: [],
  flashTime: 0,
};

function resetGame() {
  state.score = 0;
  state.ammo = 30;
  state.timeLeft = 60;
  state.player.x = 0;
  state.player.z = 0;
  state.player.yaw = 0;
  state.enemies = spawnEnemies(12);
  updateHud();
}

function spawnEnemies(count) {
  const enemies = [];
  for (let i = 0; i < count; i += 1) {
    enemies.push(newEnemy());
  }
  return enemies;
}

function newEnemy() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 8 + Math.random() * 18;
  return {
    x: Math.cos(angle) * radius,
    y: 1.4,
    z: Math.sin(angle) * radius,
    radius: 0.75,
    speed: 0.7 + Math.random() * 1.2,
    phase: Math.random() * Math.PI * 2,
  };
}

function updateHud() {
  scoreEl.textContent = `Score: ${state.score}`;
  ammoEl.textContent = `Ammo: ${state.ammo}`;
  timerEl.textContent = `Time: ${Math.ceil(Math.max(state.timeLeft, 0))}`;
}

function showStatus(message) {
  statusEl.textContent = message;
}

function update(dt) {
  if (!state.running) {
    return;
  }

  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.running = false;
    showStatus(`Time up! Final score: ${state.score}. Click to play again.`);
    document.exitPointerLock();
  }

  const moveX = (state.keys.KeyD ? 1 : 0) - (state.keys.KeyA ? 1 : 0);
  const moveZ = (state.keys.KeyW ? 1 : 0) - (state.keys.KeyS ? 1 : 0);

  const length = Math.hypot(moveX, moveZ) || 1;
  const nx = moveX / length;
  const nz = moveZ / length;

  const sin = Math.sin(state.player.yaw);
  const cos = Math.cos(state.player.yaw);

  const vx = (nx * cos - nz * sin) * state.player.speed * dt;
  const vz = (nx * sin + nz * cos) * state.player.speed * dt;

  state.player.x = clamp(state.player.x + vx, -worldSize / 2, worldSize / 2);
  state.player.z = clamp(state.player.z + vz, -worldSize / 2, worldSize / 2);

  for (const enemy of state.enemies) {
    enemy.phase += dt * enemy.speed;
    enemy.x += Math.cos(enemy.phase) * dt * 0.7;
    enemy.z += Math.sin(enemy.phase * 0.8) * dt * 0.7;

    enemy.x = clamp(enemy.x, -worldSize / 2, worldSize / 2);
    enemy.z = clamp(enemy.z, -worldSize / 2, worldSize / 2);
  }

  state.flashTime = Math.max(0, state.flashTime - dt * 5);
  updateHud();
}

function shoot() {
  if (!state.running) {
    return;
  }

  if (state.ammo <= 0) {
    showStatus("Out of ammo! Press R to reload.");
    return;
  }

  state.ammo -= 1;
  state.flashTime = 1;
  let bestTarget = null;
  let bestDepth = Infinity;

  for (const enemy of state.enemies) {
    const projected = projectToView(enemy.x, enemy.y, enemy.z);
    if (!projected || projected.depth < 0.1) {
      continue;
    }

    const pixelRadius = (enemy.radius / projected.depth) * (canvas.width / Math.tan(FOV / 2));
    const dx = projected.screenX - canvas.width / 2;
    const dy = projected.screenY - canvas.height / 2;
    const inCrosshair = dx * dx + dy * dy <= pixelRadius * pixelRadius;

    if (inCrosshair && projected.depth < bestDepth) {
      bestDepth = projected.depth;
      bestTarget = enemy;
    }
  }

  if (bestTarget) {
    state.score += 10;
    Object.assign(bestTarget, newEnemy());
    showStatus("Target hit!");
  } else {
    showStatus("Missed shot.");
  }

  if (state.ammo === 0) {
    showStatus("Out of ammo! Press R to reload.");
  }

  updateHud();
}

function reload() {
  if (state.ammo < 30) {
    state.ammo = 30;
    showStatus("Reloaded.");
    updateHud();
  }
}

function projectToView(x, y, z) {
  const dx = x - state.player.x;
  const dy = y - state.player.y;
  const dz = z - state.player.z;

  const sin = Math.sin(state.player.yaw);
  const cos = Math.cos(state.player.yaw);

  const viewX = dx * cos + dz * sin;
  const viewZ = -dx * sin + dz * cos;

  if (viewZ <= 0.1 || viewZ > MAX_VIEW_DISTANCE) {
    return null;
  }

  const f = canvas.width / (2 * Math.tan(FOV / 2));
  const screenX = canvas.width / 2 + (viewX * f) / viewZ;
  const screenY = canvas.height / 2 - (dy * f) / viewZ;

  return { screenX, screenY, depth: viewZ };
}

function drawBackground() {
  const horizon = canvas.height * 0.52;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#5d8cc7");
  sky.addColorStop(1, "#9fc5ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, horizon);

  const floor = ctx.createLinearGradient(0, horizon, 0, canvas.height);
  floor.addColorStop(0, "#43523c");
  floor.addColorStop(1, "#243022");
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, canvas.width, canvas.height - horizon);

  drawGroundGrid(horizon);
}

function drawGroundGrid(horizon) {
  ctx.strokeStyle = "rgba(230, 248, 255, 0.18)";
  ctx.lineWidth = 1;

  for (let z = 2; z <= 48; z += 2) {
    const y = horizon + (canvas.height - horizon) * (1 - 2 / (z + 2));
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  for (let x = -24; x <= 24; x += 2) {
    const p1 = projectToView(x, 0, 2);
    const p2 = projectToView(x, 0, 48);
    if (!p1 || !p2) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(p1.screenX, p1.screenY);
    ctx.lineTo(p2.screenX, p2.screenY);
    ctx.stroke();
  }
}

function drawEnemies() {
  const projected = state.enemies
    .map((enemy) => ({ enemy, p: projectToView(enemy.x, enemy.y, enemy.z) }))
    .filter((item) => item.p)
    .sort((a, b) => b.p.depth - a.p.depth);

  for (const { enemy, p } of projected) {
    const size = (enemy.radius / p.depth) * (canvas.width / Math.tan(FOV / 2));
    if (size < 2) {
      continue;
    }

    const gradient = ctx.createRadialGradient(
      p.screenX - size * 0.25,
      p.screenY - size * 0.25,
      size * 0.2,
      p.screenX,
      p.screenY,
      size
    );
    gradient.addColorStop(0, "#ffd2d2");
    gradient.addColorStop(0.6, "#db5151");
    gradient.addColorStop(1, "#7a1d1d");
    ctx.fillStyle = gradient;

    ctx.beginPath();
    ctx.arc(p.screenX, p.screenY, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCrosshair() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  ctx.strokeStyle = "#e8f4ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy);
  ctx.lineTo(cx - 3, cy);
  ctx.moveTo(cx + 3, cy);
  ctx.lineTo(cx + 12, cy);
  ctx.moveTo(cx, cy - 12);
  ctx.lineTo(cx, cy - 3);
  ctx.moveTo(cx, cy + 3);
  ctx.lineTo(cx, cy + 12);
  ctx.stroke();

  if (state.flashTime > 0) {
    ctx.fillStyle = `rgba(255, 245, 210, ${state.flashTime * 0.28})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawWeapon() {
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = "#2f3542";
  ctx.fillRect(w * 0.43, h * 0.84, w * 0.14, h * 0.16);
  ctx.fillStyle = "#474f60";
  ctx.fillRect(w * 0.47, h * 0.71, w * 0.06, h * 0.16);
  ctx.fillStyle = "#181c26";
  ctx.fillRect(w * 0.492, h * 0.61, w * 0.016, h * 0.12);
}

function draw() {
  drawBackground();
  drawEnemies();
  drawCrosshair();
  drawWeapon();
}

function frame(timestamp) {
  const dt = Math.min((timestamp - state.lastFrame) / 1000 || 0, 0.033);
  state.lastFrame = timestamp;

  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

canvas.addEventListener("click", () => {
  canvas.requestPointerLock();
  if (!state.running) {
    resetGame();
    state.running = true;
    showStatus("Game started. Eliminate as many targets as you can!");
  }
  shoot();
});

document.addEventListener("pointerlockchange", () => {
  state.pointerLocked = document.pointerLockElement === canvas;
});

document.addEventListener("mousemove", (event) => {
  if (!state.pointerLocked) {
    return;
  }

  state.player.yaw += event.movementX * 0.0024;
});

document.addEventListener("keydown", (event) => {
  state.keys[event.code] = true;
  if (event.code === "KeyR") {
    reload();
  }
});

document.addEventListener("keyup", (event) => {
  state.keys[event.code] = false;
});

resetGame();
requestAnimationFrame(frame);
