import React, { useEffect, useRef, useState, useMemo } from "react";

// ✅ Drop this component into any React app (Vite/Cra/Next). It renders a canvas-based
//    side-scrolling platformer with keyboard controls (Arrow/WASD + Space).
//    Replace placeholder asset URLs in `assetSources` with your exported images.
//    Physics: simple AABB collisions, gravity, checkpoints, collectibles, enemies.

// ---- Utility: load images ----------------------------------------------------
const loadImage = (src) =>
  new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

// ---- Component ---------------------------------------------------------------
export default function MinimalPlatformer() {
  // Canvas
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [gameState, setGameState] = useState("menu"); // menu | playing | paused | won | lost

  // Replace these with your exported asset image URLs (white backgrounds are fine).
  const assetSources = useMemo(
    () => ({
      heroIdle: "", // e.g. "/assets/hero_idle.png"
      heroRun: "",
      heroJump: "",
      slime: "",
      bee: "",
      grassTile: "",
      cloudTile: "",
      mushroomBouncy: "",
      spike: "",
      checkpointOff: "",
      checkpointOn: "",
      crystal: "",
      lever: "",
      gate: "",
      tower: "",
      tree: "",
      bush: "",
      island: "",
      saw: "",
    }),
    []
  );

  // Loaded images
  const [assets, setAssets] = useState({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      const entries = await Promise.all(
        Object.entries(assetSources).map(async ([k, v]) => [k, await loadImage(v)])
      );
      if (mounted) {
        const obj = Object.fromEntries(entries);
        setAssets(obj);
        setReady(true);
      }
    })();
    return () => (mounted = false);
  }, [assetSources]);

  // World constants
  const W = 960;
  const H = 540;
  const GRAV = 2000; // px/s^2
  const MOVE_SPEED = 260; // px/s
  const JUMP_VY = -700; // px/s

  // World layout (simple rectangles for platforms + interactive props)
  const level = useMemo(
    () => ({
      length: 4000, // world width
      groundY: 440,
      platforms: [
        { x: 0, y: 480, w: 4000, h: 60, type: "ground" },
        { x: 350, y: 380, w: 140, h: 20, type: "wood" },
        { x: 600, y: 330, w: 140, h: 20, type: "cloud" },
        { x: 900, y: 300, w: 140, h: 20, type: "mushroom" },
        { x: 1250, y: 360, w: 120, h: 20, type: "wood" },
        { x: 1600, y: 310, w: 140, h: 20, type: "cloud" },
        { x: 2000, y: 280, w: 140, h: 20, type: "wood" },
        { x: 2350, y: 340, w: 140, h: 20, type: "wood" },
        { x: 2700, y: 300, w: 160, h: 20, type: "cloud" },
        { x: 3050, y: 260, w: 160, h: 20, type: "wood" },
      ],
      checkpoints: [
        { x: 520, y: 420, r: 24, active: false },
        { x: 1900, y: 420, r: 24, active: false },
        { x: 3200, y: 420, r: 24, active: false },
      ],
      crystals: [
        { x: 365, y: 340, w: 20, h: 28, got: false },
        { x: 610, y: 290, w: 20, h: 28, got: false },
        { x: 910, y: 260, w: 20, h: 28, got: false },
        { x: 1610, y: 270, w: 20, h: 28, got: false },
        { x: 2710, y: 260, w: 20, h: 28, got: false },
      ],
      spikes: [
        { x: 1150, y: 460, w: 60, h: 20 },
        { x: 2100, y: 460, w: 60, h: 20 },
      ],
      enemies: [
        { x: 1400, y: 420, w: 36, h: 28, dir: 1, minX: 1380, maxX: 1520, type: "slime" },
        { x: 2500, y: 280, w: 28, h: 28, dir: 1, minX: 2480, maxX: 2620, type: "bee" },
      ],
      goal: { x: 3800, y: 380, w: 40, h: 100 },
    }),
    []
  );

  // Player state
  const playerRef = useRef({
    x: 80,
    y: 380,
    w: 32,
    h: 44,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    lives: 3,
    crystals: 0,
    respawn: { x: 80, y: 380 },
  });

  const cameraRef = useRef({ x: 0 });
  const keysRef = useRef(new Set());

  // Keyboard input
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", " ", "a", "d", "w"].includes(k)) e.preventDefault();
      keysRef.current.add(k);
      if (k === "escape") setGameState((s) => (s === "playing" ? "paused" : s));
    };
    const up = (e) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Physics helpers
  const aabb = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const integrate = (dt) => {
    const p = playerRef.current;
    const ks = keysRef.current;

    // Horizontal movement
    let mv = 0;
    if (ks.has("arrowleft") || ks.has("a")) mv -= 1;
    if (ks.has("arrowright") || ks.has("d")) mv += 1;
    p.vx = mv * MOVE_SPEED;
    if (mv !== 0) p.facing = mv;

    // Jump
    const wantsJump = ks.has(" ") || ks.has("arrowup") || ks.has("w");
    if (wantsJump && p.onGround) {
      p.vy = JUMP_VY;
      p.onGround = false;
    }

    // Gravity
    p.vy += GRAV * dt;

    // Integrate
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Collide with platforms
    p.onGround = false;
    const solids = [
      ...level.platforms,
      { x: 0, y: level.groundY, w: level.length, h: 100, type: "ground" },
    ];

    for (const s of solids) {
      if (!aabb(p, s)) continue;
      // Resolve minimal translation on Y first (platformer feel)
      const prevY = p.y - p.vy * dt;
      const prevX = p.x - p.vx * dt;

      // Try vertical resolution
      if (prevX + p.w > s.x && prevX < s.x + s.w) {
        if (p.vy > 0 && prevY + p.h <= s.y) {
          // landing on top
          p.y = s.y - p.h;
          p.vy = 0;
          p.onGround = true;
        } else if (p.vy < 0 && prevY >= s.y + s.h) {
          // hitting head
          p.y = s.y + s.h;
          p.vy = 0;
        }
      }

      // Horizontal resolution if still intersecting
      if (aabb(p, s)) {
        if (p.vx > 0) p.x = s.x - p.w;
        else if (p.vx < 0) p.x = s.x + s.w;
        p.vx = 0;
      }
    }

    // Spikes
    for (const sp of level.spikes) {
      if (aabb(p, sp)) damage();
    }

    // Enemies (patrol)
    for (const en of level.enemies) {
      en.x += en.dir * 60 * dt;
      if (en.x < en.minX || en.x > en.maxX) en.dir *= -1;
      if (aabb(p, en)) damage();
    }

    // Crystals
    for (const c of level.crystals) {
      if (!c.got && aabb(p, c)) {
        c.got = true;
        p.crystals += 1;
      }
    }

    // Checkpoints
    for (const cp of level.checkpoints) {
      const circ = { x: cp.x - cp.r, y: cp.y - cp.r, w: cp.r * 2, h: cp.r * 2 };
      if (aabb(p, circ)) {
        cp.active = true;
        p.respawn = { x: cp.x, y: p.y };
      }
    }

    // Goal
    if (aabb(p, level.goal)) setGameState("won");

    // Keep inside world
    if (p.x < 0) p.x = 0;
    if (p.x + p.w > level.length) p.x = level.length - p.w;

    // Camera follow
    cameraRef.current.x = Math.max(0, Math.min(p.x - W / 2, level.length - W));
  };

  const damage = () => {
    const p = playerRef.current;
    p.lives -= 1;
    if (p.lives <= 0) {
      setGameState("lost");
      return;
    }
    // respawn at last checkpoint
    p.x = p.respawn.x;
    p.y = p.respawn.y;
    p.vx = 0;
    p.vy = 0;
  };

  // Game loop
  useEffect(() => {
    if (!ready) return;
    const cnv = canvasRef.current;
    const ctx = cnv.getContext("2d");
    let last = performance.now();
    let raf;

    const loop = (t) => {
      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;
      if (gameState === "playing") integrate(dt);
      draw(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, gameState]);

  // Drawing
  const draw = (ctx) => {
    const camX = cameraRef.current.x;
    ctx.clearRect(0, 0, W, H);

    // White background (so your exported assets with white bg blend nicely)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Parallax sky deco (simple)
    ctx.globalAlpha = 1;

    // Draw platforms (tiles if provided)
    for (const pf of level.platforms) drawPlatform(ctx, pf, camX);

    // Ground shadow line
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(-camX, level.groundY + 20, level.length, 4);

    // Spikes
    for (const sp of level.spikes) drawSpike(ctx, sp, camX);

    // Checkpoints
    for (const cp of level.checkpoints) drawCheckpoint(ctx, cp, camX);

    // Crystals
    for (const c of level.crystals) if (!c.got) drawCrystal(ctx, c, camX);

    // Enemies
    for (const en of level.enemies) drawEnemy(ctx, en, camX);

    // Goal (tower/gate)
    drawGoal(ctx, level.goal, camX);

    // Player
    drawPlayer(ctx, playerRef.current, camX);

    // HUD
    drawHUD(ctx);
  };

  // Draw helpers --------------------------------------------------------------
  const drawImageOrRect = (ctx, img, x, y, w, h, color = "#333") => {
    if (img) ctx.drawImage(img, x, y, w, h);
    else {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    }
  };

  const drawPlatform = (ctx, pf, camX) => {
    const img = pf.type === "cloud" ? assets.cloudTile : assets.grassTile || null;
    const tileW = 40;
    for (let i = 0; i < Math.ceil(pf.w / tileW); i++) {
      const x = Math.floor(pf.x + i * tileW - camX);
      const y = pf.y;
      drawImageOrRect(ctx, img, x, y, tileW, pf.h, pf.type === "cloud" ? "#dfefff" : "#bada55");
    }
  };

  const drawSpike = (ctx, sp, camX) => {
    drawImageOrRect(ctx, assets.spike, sp.x - camX, sp.y, sp.w, sp.h, "#ff8a80");
  };

  const drawCheckpoint = (ctx, cp, camX) => {
    const img = cp.active ? assets.checkpointOn : assets.checkpointOff;
    const x = cp.x - cp.r - camX;
    const y = cp.y - cp.r;
    drawImageOrRect(ctx, img, x, y, cp.r * 2, cp.r * 2, cp.active ? "#ffd54f" : "#cfd8dc");
  };

  const drawCrystal = (ctx, c, camX) => {
    drawImageOrRect(ctx, assets.crystal, c.x - camX, c.y, c.w, c.h, "#88ddff");
  };

  const drawEnemy = (ctx, e, camX) => {
    const img = e.type === "bee" ? assets.bee : assets.slime;
    drawImageOrRect(ctx, img, e.x - camX, e.y, e.w, e.h, "#88cc66");
  };

  const drawGoal = (ctx, g, camX) => {
    drawImageOrRect(ctx, assets.tower, g.x - camX, g.y - 60, 80, 160, "#90caf9");
  };

  const drawPlayer = (ctx, p, camX) => {
    let img = assets.heroIdle;
    if (!p.onGround) img = assets.heroJump || assets.heroIdle;
    else if (Math.abs(p.vx) > 1) img = assets.heroRun || assets.heroIdle;

    const scale = 1.2;
    const w = p.w * scale;
    const h = p.h * scale;
    const x = Math.floor(p.x - camX);
    const y = Math.floor(p.y - (h - p.h));

    if (img) {
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(p.facing, 1);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = "#333";
      ctx.fillRect(x, y, w, h);
    }
  };

  const drawHUD = (ctx) => {
    const p = playerRef.current;
    ctx.fillStyle = "#222";
    ctx.font = "16px ui-sans-serif, system-ui";
    ctx.fillText(`Lives: ${p.lives}`, 16, 24);
    ctx.fillText(`Crystals: ${p.crystals}`, 16, 44);
  };

  // UI ------------------------------------------------------------------------
  const startGame = () => {
    // reset player and level flags
    const p = playerRef.current;
    p.x = 80; p.y = 380; p.vx = 0; p.vy = 0; p.lives = 3; p.crystals = 0; p.respawn = { x: 80, y: 380 };
    level.crystals.forEach((c) => (c.got = false));
    level.checkpoints.forEach((c) => (c.active = false));
    setGameState("playing");
  };

  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Minimal Platformer</h1>
        <span className="text-sm opacity-60">(Arrow/WASD to move, Space to jump, Esc to pause)</span>
      </div>

      <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl shadow-lg border border-gray-200" />

      <div className="flex gap-2">
        {gameState !== "playing" && (
          <button onClick={startGame} className="px-4 py-2 rounded-2xl shadow bg-black text-white">Start Game</button>
        )}
        {gameState === "playing" && (
          <button onClick={() => setGameState("paused")} className="px-4 py-2 rounded-2xl shadow border">Pause</button>
        )}
        {gameState === "paused" && (
          <button onClick={() => setGameState("playing")} className="px-4 py-2 rounded-2xl shadow bg-black text-white">Resume</button>
        )}
        {(gameState === "won" || gameState === "lost") && (
          <button onClick={startGame} className="px-4 py-2 rounded-2xl shadow bg-black text-white">Restart</button>
        )}
      </div>

      {/* Overlays */}
      {gameState !== "playing" && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="pointer-events-auto bg-white/90 backdrop-blur rounded-3xl p-6 shadow-xl border w-[720px] max-w-[92vw]">
            {gameState === "menu" && (
              <div className="space-y-3">
                <h2 className="text-xl font-semibold">Start Menu</h2>
                <p className="text-sm opacity-70">Use the buttons below to start. Replace image URLs in code to use your own art.</p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={startGame} className="px-4 py-2 rounded-2xl shadow bg-black text-white">Start Game</button>
                  <button onClick={() => setGameState("playing")} className="px-4 py-2 rounded-2xl shadow border">Try Without Assets</button>
                </div>
              </div>
            )}
            {gameState === "paused" && <p className="text-center">Paused — press Resume or Esc</p>}
            {gameState === "won" && <p className="text-center">You reached the tower! 🎉</p>}
            {gameState === "lost" && <p className="text-center">Out of lives. Try again! 💫</p>}
          </div>
        </div>
      )}
    </div>
  );
}
