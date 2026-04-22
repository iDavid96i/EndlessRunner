/* ============================================================
   SKYLINE DASH — Game Engine
   2D side-scrolling endless runner, canvas-rendered.
   ============================================================ */

(() => {
'use strict';

// ---------- Math / Utilities ----------
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (min, max) => Math.random() * (max - min) + min;
const randi = (min, max) => Math.floor(rand(min, max + 1));
const choose = arr => arr[Math.floor(Math.random() * arr.length)];
const now = () => performance.now();

// ---------- World Constants ----------
const WORLD = {
    groundY: 0.78,       // fraction of height
    gravity: 2400,
    jumpVel: -920,
    doubleJumpVel: -780,
    slideDur: 0.55,
    baseSpeed: 420,
    speedGain: 6.5,      // px/s per second
    maxSpeed: 1100,
    spawnMinGap: 0.55,   // seconds at base speed
    spawnMaxGap: 1.3,
};

// Character dimensions (in world units, will be scaled)
const CHAR = {
    width: 52,
    height: 78,
    slideHeight: 40,
    x: 0.22,  // fraction from left
};

// ---------- Audio (WebAudio, no external files) ----------
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.musicOn = true;
        this.sfxOn = true;
        this.musicNode = null;
    }
    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.35;
            this.sfxGain.connect(this.ctx.destination);
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.12;
            this.musicGain.connect(this.ctx.destination);
        } catch (e) { /* no audio */ }
    }
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
    setMusic(on) { this.musicOn = on; if (this.musicGain) this.musicGain.gain.value = on ? 0.12 : 0; }
    setSfx(on)   { this.sfxOn = on;   if (this.sfxGain)   this.sfxGain.gain.value   = on ? 0.35 : 0; }

    tone(freq, dur = 0.12, type = 'sine', volume = 1.0, slide = null) {
        if (!this.ctx || !this.sfxOn) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slide != null) osc.frequency.exponentialRampToValueAtTime(slide, this.ctx.currentTime + dur);
        g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(volume, this.ctx.currentTime + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
        osc.connect(g).connect(this.sfxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + dur + 0.02);
    }
    jump()   { this.tone(520, 0.14, 'triangle', 0.5, 880); }
    slide()  { this.tone(280, 0.18, 'sawtooth', 0.25, 140); }
    coin()   { this.tone(1200, 0.08, 'square', 0.25); setTimeout(() => this.tone(1800, 0.08, 'square', 0.25), 50); }
    gem()    { this.tone(900, 0.1, 'triangle', 0.4); setTimeout(() => this.tone(1400, 0.12, 'triangle', 0.4), 80); setTimeout(() => this.tone(1800, 0.14, 'triangle', 0.35), 160); }
    hit()    { this.tone(200, 0.35, 'sawtooth', 0.5, 60); }
    power()  { this.tone(440, 0.1, 'sine', 0.4); setTimeout(() => this.tone(660, 0.1, 'sine', 0.4), 70); setTimeout(() => this.tone(880, 0.15, 'sine', 0.4), 140); }
    countdown() { this.tone(660, 0.08, 'sine', 0.4); }
    go()        { this.tone(880, 0.2, 'triangle', 0.5); }
}

// ---------- Input ----------
class Input {
    constructor(canvas) {
        this.canvas = canvas;
        this.jumpPressed = false;
        this.slidePressed = false;
        this.slideHeld = false;
        this._onJump = () => {};
        this._onSlide = () => {};
        this._onSlideEnd = () => {};
        this._onPause = () => {};

        // Keyboard
        window.addEventListener('keydown', e => {
            if (e.repeat) return;
            switch (e.code) {
                case 'Space': case 'ArrowUp': case 'KeyW':
                    e.preventDefault(); this._onJump(); break;
                case 'ArrowDown': case 'KeyS':
                    e.preventDefault(); this.slideHeld = true; this._onSlide(); break;
                case 'Escape': case 'KeyP':
                    e.preventDefault(); this._onPause(); break;
            }
        });
        window.addEventListener('keyup', e => {
            if (e.code === 'ArrowDown' || e.code === 'KeyS') {
                this.slideHeld = false;
                this._onSlideEnd();
            }
        });

        // Touch / Pointer swipe
        let startY = 0, startX = 0, startTime = 0, tracking = false;
        const SWIPE_MIN = 28;

        const onDown = e => {
            const t = e.touches ? e.touches[0] : e;
            startY = t.clientY; startX = t.clientX;
            startTime = now();
            tracking = true;
        };
        const onUp = e => {
            if (!tracking) return;
            tracking = false;
            const t = e.changedTouches ? e.changedTouches[0] : e;
            const dy = t.clientY - startY;
            const dx = t.clientX - startX;
            const dt = now() - startTime;

            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_MIN) {
                if (dy < 0) this._onJump();
                else        { this._onSlide(); setTimeout(() => this._onSlideEnd(), 550); }
            } else if (dt < 250 && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
                // tap = jump
                this._onJump();
            }
        };

        canvas.addEventListener('touchstart', onDown, { passive: true });
        canvas.addEventListener('touchend', onUp);
        canvas.addEventListener('mousedown', onDown);
        canvas.addEventListener('mouseup', onUp);
    }
    onJump(fn)     { this._onJump = fn; }
    onSlide(fn)    { this._onSlide = fn; }
    onSlideEnd(fn) { this._onSlideEnd = fn; }
    onPause(fn)    { this._onPause = fn; }
}

// ---------- Particles ----------
class ParticleSystem {
    constructor() { this.particles = []; this.enabled = true; }

    spawn(opts) {
        if (!this.enabled) return;
        const count = opts.count || 1;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: opts.x + rand(-4, 4),
                y: opts.y + rand(-4, 4),
                vx: opts.vx != null ? opts.vx + rand(-40, 40) : rand(-80, 80),
                vy: opts.vy != null ? opts.vy + rand(-40, 40) : rand(-200, -50),
                size: opts.size || rand(3, 6),
                color: opts.color || '#fff',
                life: opts.life || rand(0.3, 0.7),
                age: 0,
                gravity: opts.gravity != null ? opts.gravity : 800,
                shape: opts.shape || 'circle',
                rot: rand(0, Math.PI * 2),
                vrot: rand(-8, 8),
                fade: opts.fade !== false,
            });
        }
    }

    burst(x, y, color, count = 14) {
        this.spawn({ x, y, color, count, life: 0.5, size: 4 });
    }

    trail(x, y, color) {
        this.spawn({ x, y, color, count: 1, life: 0.3, size: 3, vx: 0, vy: 0, gravity: 0, fade: true });
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.age += dt;
            if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
            p.vy += p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.vrot * dt;
        }
    }

    draw(ctx) {
        for (const p of this.particles) {
            const a = p.fade ? 1 - (p.age / p.life) : 1;
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color;
            if (p.shape === 'square') {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    clear() { this.particles.length = 0; }
}

// ---------- Parallax Background ----------
class Parallax {
    constructor() {
        this.layers = [
            { speed: 0.08, color1: '#4a2878', color2: '#ff7ab0', shapes: this._mountains(6, 0.55, 0.85), blur: 0 },
            { speed: 0.2,  color1: '#2b1e5e', color2: '#6b3fa0', shapes: this._mountains(8, 0.4, 0.7),  blur: 0 },
            { speed: 0.4,  color1: '#1d1448', color2: '#4325a0', shapes: this._buildings(12),            blur: 0 },
        ];
        this.clouds = [];
        for (let i = 0; i < 5; i++) this.clouds.push({ x: rand(0, 1), y: rand(0.05, 0.3), scale: rand(0.6, 1.3), speed: rand(0.02, 0.06) });
        this.stars = [];
        for (let i = 0; i < 40; i++) this.stars.push({ x: rand(0, 1), y: rand(0, 0.5), size: rand(1, 2.2), tw: rand(0, Math.PI * 2) });
        this.t = 0;
    }
    _mountains(n, minH, maxH) {
        const pts = [];
        for (let i = 0; i < n; i++) pts.push({ x: i / n + rand(-0.02, 0.02), h: rand(minH, maxH) });
        return pts;
    }
    _buildings(n) {
        const arr = [];
        for (let i = 0; i < n; i++) arr.push({ x: i / n, w: rand(0.06, 0.1), h: rand(0.35, 0.6), windows: Math.random() > 0.3 });
        return arr;
    }

    update(dt, speed) {
        this.t += dt;
        for (const l of this.layers) {
            l.offset = (l.offset || 0) + speed * l.speed * dt;
        }
        for (const c of this.clouds) {
            c.x -= c.speed * dt + speed * 0.00004 * dt;
            if (c.x < -0.2) c.x = 1.1;
        }
    }

    draw(ctx, W, H) {
        // Sky gradient
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#0f1539');
        sky.addColorStop(0.45, '#2b1c5a');
        sky.addColorStop(0.8, '#6b2e7a');
        sky.addColorStop(1, '#ff7a7a');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // Stars
        ctx.fillStyle = '#fff';
        for (const s of this.stars) {
            const tw = 0.5 + 0.5 * Math.sin(this.t * 2 + s.tw);
            ctx.globalAlpha = 0.4 + 0.5 * tw;
            ctx.fillRect(s.x * W, s.y * H, s.size, s.size);
        }
        ctx.globalAlpha = 1;

        // Sun/planet
        const sx = W * 0.72, sy = H * 0.3;
        const sunGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.18);
        sunGrad.addColorStop(0, '#ffc37a');
        sunGrad.addColorStop(0.6, 'rgba(255,122,176,0.3)');
        sunGrad.addColorStop(1, 'rgba(255,122,176,0)');
        ctx.fillStyle = sunGrad;
        ctx.fillRect(sx - H * 0.2, sy - H * 0.2, H * 0.4, H * 0.4);
        ctx.fillStyle = '#ffd89b';
        ctx.beginPath();
        ctx.arc(sx, sy, H * 0.055, 0, Math.PI * 2);
        ctx.fill();

        // Clouds
        for (const c of this.clouds) {
            const cx = c.x * W, cy = c.y * H, s = c.scale;
            ctx.fillStyle = 'rgba(255, 240, 245, 0.18)';
            ctx.beginPath();
            ctx.ellipse(cx, cy, 50 * s, 16 * s, 0, 0, Math.PI * 2);
            ctx.ellipse(cx + 30 * s, cy - 8 * s, 30 * s, 14 * s, 0, 0, Math.PI * 2);
            ctx.ellipse(cx - 26 * s, cy - 4 * s, 24 * s, 12 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Parallax layers
        for (let li = 0; li < this.layers.length; li++) {
            const l = this.layers[li];
            const off = (l.offset || 0) % W;
            if (li < 2) this._drawMountains(ctx, l, W, H, off);
            else this._drawBuildings(ctx, l, W, H, off);
        }
    }

    _drawMountains(ctx, l, W, H, off) {
        const groundY = H * WORLD.groundY;
        for (let pass = 0; pass < 2; pass++) {
            const baseX = -off + pass * W;
            ctx.beginPath();
            ctx.moveTo(baseX, groundY);
            const step = W / (l.shapes.length - 1);
            for (let i = 0; i < l.shapes.length; i++) {
                const s = l.shapes[i];
                const x = baseX + i * step;
                const y = groundY - H * 0.3 * s.h;
                if (i === 0) ctx.lineTo(x, y);
                else {
                    const prev = l.shapes[i - 1];
                    const px = baseX + (i - 1) * step;
                    const py = groundY - H * 0.3 * prev.h;
                    const cx = (px + x) / 2;
                    ctx.quadraticCurveTo(cx, Math.min(py, y) - 10, x, y);
                }
            }
            ctx.lineTo(baseX + W, groundY);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, groundY - H * 0.3, 0, groundY);
            grad.addColorStop(0, l.color2);
            grad.addColorStop(1, l.color1);
            ctx.fillStyle = grad;
            ctx.fill();
        }
    }

    _drawBuildings(ctx, l, W, H, off) {
        const groundY = H * WORLD.groundY;
        for (let pass = 0; pass < 2; pass++) {
            const baseX = -off + pass * W;
            for (const b of l.shapes) {
                const x = baseX + b.x * W;
                const w = b.w * W;
                const h = b.h * H * 0.5;
                const y = groundY - h;
                ctx.fillStyle = l.color1;
                ctx.fillRect(x, y, w, h);
                // Highlight strip
                ctx.fillStyle = l.color2;
                ctx.fillRect(x, y, w * 0.15, h);
                // Windows
                if (b.windows) {
                    ctx.fillStyle = 'rgba(255, 220, 120, 0.5)';
                    const cols = 3, rows = Math.floor(h / 18);
                    for (let c = 0; c < cols; c++) {
                        for (let r = 1; r < rows; r++) {
                            if ((c + r + Math.floor(b.x * 100)) % 3 === 0) continue;
                            ctx.fillRect(x + 6 + c * (w / cols), y + r * 18, w / cols - 8, 8);
                        }
                    }
                }
            }
        }
    }
}

// ---------- Ground ----------
class Ground {
    constructor() { this.offset = 0; this.tileSize = 80; }
    update(dt, speed) { this.offset = (this.offset + speed * dt) % this.tileSize; }
    draw(ctx, W, H) {
        const groundY = H * WORLD.groundY;
        // Ground fill
        const grad = ctx.createLinearGradient(0, groundY, 0, H);
        grad.addColorStop(0, '#2c1b52');
        grad.addColorStop(1, '#180f30');
        ctx.fillStyle = grad;
        ctx.fillRect(0, groundY, W, H - groundY);

        // Glow line on top edge
        ctx.fillStyle = 'rgba(255, 90, 168, 0.9)';
        ctx.fillRect(0, groundY - 2, W, 2);
        ctx.fillStyle = 'rgba(255, 90, 168, 0.3)';
        ctx.fillRect(0, groundY - 6, W, 4);

        // Tile markers (moving)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        for (let x = -this.offset; x < W; x += this.tileSize) {
            ctx.fillRect(x, groundY + 6, this.tileSize * 0.5, 2);
        }

        // Subtle grid going into distance
        ctx.strokeStyle = 'rgba(90, 224, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 6; i++) {
            const y = groundY + (H - groundY) * Math.pow(i / 6, 2);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }
    }
}

// ---------- Character ----------
class Character {
    constructor() {
        this.reset();
        this.skin = 'pink';
    }
    reset() {
        this.y = 0;        // offset from groundline (negative = up)
        this.vy = 0;
        this.onGround = true;
        this.jumpsLeft = 2;
        this.sliding = false;
        this.slideTimer = 0;
        this.runPhase = 0;
        this.invincible = 0;
        this.dead = false;
        this.deathT = 0;
    }
    jump(audio) {
        if (this.dead) return;
        if (this.jumpsLeft <= 0) return;
        const firstJump = this.jumpsLeft === 2;
        this.vy = firstJump ? WORLD.jumpVel : WORLD.doubleJumpVel;
        this.jumpsLeft--;
        this.onGround = false;
        this.sliding = false;
        audio && audio.jump();
    }
    startSlide(audio) {
        if (this.dead) return;
        if (!this.onGround) {
            // fast-fall
            this.vy = Math.max(this.vy, 600);
            return;
        }
        if (this.sliding) return;
        this.sliding = true;
        this.slideTimer = WORLD.slideDur;
        audio && audio.slide();
    }
    endSlide() {
        this.slideTimer = Math.min(this.slideTimer, 0.08);
    }
    die() {
        if (this.dead) return;
        this.dead = true;
        this.deathT = 0;
        this.vy = -700;
    }

    update(dt, speed) {
        this.runPhase += dt * (8 + speed * 0.005);
        this.invincible = Math.max(0, this.invincible - dt);

        if (this.dead) {
            this.deathT += dt;
            this.vy += WORLD.gravity * dt;
            this.y += this.vy * dt;
            return;
        }

        // Gravity
        this.vy += WORLD.gravity * dt;
        this.y += this.vy * dt;
        if (this.y >= 0) {
            this.y = 0;
            this.vy = 0;
            if (!this.onGround) {
                // landed
                this.onGround = true;
                this.jumpsLeft = 2;
            }
        } else {
            this.onGround = false;
        }

        // Slide timer
        if (this.sliding) {
            this.slideTimer -= dt;
            if (this.slideTimer <= 0) this.sliding = false;
        }
    }

    getBounds(W, H) {
        const groundY = H * WORLD.groundY;
        const w = CHAR.width;
        const h = this.sliding ? CHAR.slideHeight : CHAR.height;
        const cx = W * CHAR.x;
        const y = groundY + this.y - h;
        return { x: cx - w / 2 + 6, y: y + 6, w: w - 12, h: h - 10, cx, groundY };
    }

    draw(ctx, W, H, t) {
        const b = this.getBounds(W, H);
        const { cx, groundY } = b;
        const h = this.sliding ? CHAR.slideHeight : CHAR.height;
        const y = groundY + this.y - h;

        // Flicker when invincible
        const flash = this.invincible > 0 && Math.floor(this.invincible * 20) % 2 === 0;
        if (flash) ctx.globalAlpha = 0.5;

        const col = SKIN_COLORS[this.skin] || SKIN_COLORS.pink;
        const tilt = this.dead ? this.deathT * 4 :
                     this.sliding ? 0.5 :
                     this.onGround ? Math.sin(this.runPhase) * 0.04 :
                     (this.vy < 0 ? -0.1 : 0.1);

        ctx.save();
        ctx.translate(cx, y + h);
        ctx.rotate(tilt);

        if (this.sliding) this._drawSliding(ctx, col);
        else this._drawRunning(ctx, col, this.onGround);

        ctx.restore();

        // Shadow on ground
        if (!this.dead) {
            const altitude = Math.min(1, Math.abs(this.y) / 260);
            ctx.fillStyle = `rgba(0, 0, 0, ${0.3 * (1 - altitude)})`;
            ctx.beginPath();
            ctx.ellipse(cx, groundY + 2, 22 * (1 - altitude * 0.5), 6 * (1 - altitude * 0.7), 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
    }

    _drawRunning(ctx, col, onGround) {
        const w = CHAR.width, h = CHAR.height;
        const bodyT = onGround ? Math.sin(this.runPhase) * 2 : 0;

        // Legs
        const legSwing = onGround ? Math.sin(this.runPhase) * 14 : 4;
        const legSwing2 = onGround ? Math.sin(this.runPhase + Math.PI) * 14 : -4;

        ctx.fillStyle = col.legs;
        this._roundRect(ctx, -10, -22, 8, 22 + Math.abs(legSwing) * 0.2, 4);
        ctx.fill();
        ctx.save();
        ctx.translate(-2, -22);
        ctx.rotate(legSwing * 0.04);
        ctx.fillStyle = col.legs;
        this._roundRect(ctx, -4, 0, 8, 22, 4);
        ctx.fill();
        ctx.restore();

        // Shoes
        ctx.fillStyle = col.shoes;
        this._roundRect(ctx, -12, -4 + Math.max(0, legSwing * 0.2), 12, 6, 3);
        ctx.fill();
        this._roundRect(ctx, 0, -4 + Math.max(0, legSwing2 * 0.2), 12, 6, 3);
        ctx.fill();

        // Body
        ctx.fillStyle = col.body;
        this._roundRect(ctx, -16, -54 + bodyT, 32, 34, 10);
        ctx.fill();

        // Body accent stripe
        ctx.fillStyle = col.accent;
        this._roundRect(ctx, -16, -34 + bodyT, 32, 6, 3);
        ctx.fill();

        // Arms
        const armSwing = onGround ? Math.sin(this.runPhase + Math.PI) * 16 : -20;
        ctx.save();
        ctx.translate(-12, -46 + bodyT);
        ctx.rotate(armSwing * 0.03);
        ctx.fillStyle = col.body;
        this._roundRect(ctx, -3, 0, 7, 22, 3);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(12, -46 + bodyT);
        ctx.rotate(-armSwing * 0.03);
        ctx.fillStyle = col.body;
        this._roundRect(ctx, -3, 0, 7, 22, 3);
        ctx.fill();
        ctx.restore();

        // Head
        ctx.fillStyle = col.skin;
        ctx.beginPath();
        ctx.arc(0, -62 + bodyT, 14, 0, Math.PI * 2);
        ctx.fill();

        // Hair
        ctx.fillStyle = col.hair;
        ctx.beginPath();
        ctx.arc(0, -66 + bodyT, 14, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-14, -66 + bodyT, 6, 8);

        // Eye
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(4, -62 + bodyT, 3, 3);

        // Goggles/visor tint
        if (col.visor) {
            ctx.fillStyle = col.visor;
            ctx.globalAlpha = 0.5;
            ctx.fillRect(-2, -64 + bodyT, 14, 5);
            ctx.globalAlpha = 1;
        }
    }

    _drawSliding(ctx, col) {
        // Horizontal pose
        // Body
        ctx.fillStyle = col.body;
        this._roundRect(ctx, -26, -28, 46, 22, 10);
        ctx.fill();
        ctx.fillStyle = col.accent;
        this._roundRect(ctx, -26, -18, 46, 4, 2);
        ctx.fill();

        // Legs behind
        ctx.fillStyle = col.legs;
        this._roundRect(ctx, -34, -12, 14, 8, 3);
        ctx.fill();
        ctx.fillStyle = col.shoes;
        this._roundRect(ctx, -38, -8, 10, 5, 2);
        ctx.fill();

        // Head
        ctx.fillStyle = col.skin;
        ctx.beginPath();
        ctx.arc(22, -22, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col.hair;
        ctx.beginPath();
        ctx.arc(22, -26, 11, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(26, -22, 3, 3);
        // Trail streaks
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        for (let i = 0; i < 3; i++) ctx.fillRect(-40 - i * 8, -22 + i * 4, 6, 2);
    }

    _roundRect(ctx, x, y, w, h, r) {
        const min = Math.min(w / 2, h / 2);
        r = Math.min(r, min);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
}

const SKIN_COLORS = {
    pink:    { body: '#ff5aa8', accent: '#ffb14d', legs: '#3a2757', shoes: '#ff5aa8', skin: '#ffd8b8', hair: '#2b1e5e', visor: null },
    cyan:    { body: '#5ae0ff', accent: '#7cf4a4', legs: '#1a3558', shoes: '#5ae0ff', skin: '#ffd8b8', hair: '#fff', visor: '#00eaff' },
    neon:    { body: '#7cf4a4', accent: '#ff5aa8', legs: '#0f3a2a', shoes: '#ffb14d', skin: '#ffd8b8', hair: '#1a1a2e', visor: null },
    royal:   { body: '#a875ff', accent: '#ffd84a', legs: '#2a1054', shoes: '#ffd84a', skin: '#e8c5a3', hair: '#4a2878', visor: null },
    shadow:  { body: '#2b2b4e', accent: '#ff3355', legs: '#111127', shoes: '#ff3355', skin: '#d0d0e8', hair: '#0b0b1d', visor: '#ff3355' },
    sunset:  { body: '#ff8a4a', accent: '#ffd84a', legs: '#5a2828', shoes: '#ff4a6b', skin: '#ffd8b8', hair: '#3d1a1a', visor: null },
};

// ---------- Entities (obstacles, coins, powerups) ----------
class Entity {
    constructor(type, x, y, data = {}) {
        this.type = type;
        this.x = x; this.y = y;
        this.data = data;
        this.dead = false;
        this.t = 0;
        this.collected = false;
    }
}

// ---------- Game ----------
class Game {
    constructor(canvas, callbacks) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.cb = callbacks || {};
        this.W = 0; this.H = 0; this.dpr = 1;

        this.audio = new AudioEngine();
        this.input = new Input(canvas);
        this.particles = new ParticleSystem();
        this.parallax = new Parallax();
        this.ground = new Ground();
        this.character = new Character();

        this.state = 'menu'; // menu | playing | paused | gameover
        this.speed = WORLD.baseSpeed;
        this.distance = 0;
        this.coins = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.entities = [];
        this.spawnTimer = 0;
        this.shakeTimer = 0;
        this.hitFlashTimer = 0;
        this.shakeEnabled = true;

        this.powerups = {
            shield: 0,
            magnet: 0,
            boost: 0,
        };

        this.input.onJump(() => this._handleJump());
        this.input.onSlide(() => this._handleSlide());
        this.input.onSlideEnd(() => this.character.endSlide());
        this.input.onPause(() => { if (this.state === 'playing') this.pause(); });

        window.addEventListener('resize', () => this.resize());
        this.resize();

        this._lastT = now();
        requestAnimationFrame(() => this._loop());
    }

    resize() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.floor(w * this.dpr);
        this.canvas.height = Math.floor(h * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.W = w; this.H = h;
    }

    _handleJump() {
        if (this.state !== 'playing') return;
        this.audio.resume();
        this.character.jump(this.audio);
        if (!this.character.onGround) {
            this.particles.spawn({
                x: this.W * CHAR.x,
                y: this.H * WORLD.groundY + this.character.y,
                count: 6, color: '#5ae0ff', size: 3, life: 0.4,
                vy: 40, vx: -100,
            });
        }
        this.cb.onAction && this.cb.onAction('jump');
    }
    _handleSlide() {
        if (this.state !== 'playing') return;
        this.character.startSlide(this.audio);
        this.particles.spawn({
            x: this.W * CHAR.x,
            y: this.H * WORLD.groundY - 4,
            count: 8, color: '#fff', size: 3, life: 0.3,
            vx: -200, vy: -20, gravity: 200,
        });
        this.cb.onAction && this.cb.onAction('slide');
    }

    start() {
        this.audio.init();
        this.audio.resume();
        this._reset();
        this.state = 'playing';
        this.cb.onStateChange && this.cb.onStateChange('playing');
    }

    _reset() {
        this.speed = WORLD.baseSpeed;
        this.distance = 0;
        this.coins = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.entities = [];
        this.spawnTimer = 0.8;
        this.shakeTimer = 0;
        this.hitFlashTimer = 0;
        this.powerups = { shield: 0, magnet: 0, boost: 0 };
        this.character.reset();
        this.particles.clear();
    }

    pause() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        this.cb.onStateChange && this.cb.onStateChange('paused');
    }
    resume() {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        this.cb.onStateChange && this.cb.onStateChange('playing');
    }

    gotoMenu() {
        this.state = 'menu';
        this._reset();
        this.cb.onStateChange && this.cb.onStateChange('menu');
    }

    setSkin(skin) { this.character.skin = skin; }

    // ---------- Main loop ----------
    _loop() {
        const t = now();
        let dt = (t - this._lastT) / 1000;
        this._lastT = t;
        dt = clamp(dt, 0, 1 / 30);

        if (this.state === 'playing') this._update(dt);
        else if (this.state === 'menu') this._updateMenu(dt);

        this._render();
        requestAnimationFrame(() => this._loop());
    }

    _updateMenu(dt) {
        // Keep parallax moving gently for atmosphere
        this.parallax.update(dt, WORLD.baseSpeed * 0.5);
        this.ground.update(dt, WORLD.baseSpeed * 0.5);
        this.particles.update(dt);
        this.character.runPhase += dt * 10;
    }

    _update(dt) {
        // Speed ramp (boost multiplier)
        const target = Math.min(WORLD.maxSpeed, WORLD.baseSpeed + WORLD.speedGain * this.distance * 0.02);
        this.speed = lerp(this.speed, target, 1 - Math.pow(0.001, dt));
        const effSpeed = this.speed * (this.powerups.boost > 0 ? 1.5 : 1);

        // Powerup timers
        for (const k of Object.keys(this.powerups)) this.powerups[k] = Math.max(0, this.powerups[k] - dt);

        // Distance / score
        this.distance += effSpeed * dt * 0.02;

        // Combo timer
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) this.combo = 0;
        }

        // Scene
        this.parallax.update(dt, effSpeed);
        this.ground.update(dt, effSpeed);
        this.character.update(dt, effSpeed);
        this.particles.update(dt);

        // Running trail
        if (this.character.onGround && !this.character.dead && Math.random() < 0.35) {
            this.particles.spawn({
                x: this.W * CHAR.x - 10, y: this.H * WORLD.groundY - 2,
                count: 1, color: 'rgba(255,255,255,0.3)', size: 2, life: 0.3,
                vx: -100, vy: -30, gravity: 200,
            });
        }

        // Boost particle trail
        if (this.powerups.boost > 0 && Math.random() < 0.8) {
            this.particles.spawn({
                x: this.W * CHAR.x - 20, y: this.H * WORLD.groundY + this.character.y - CHAR.height / 2,
                count: 1, color: '#ffb14d', size: rand(2, 5), life: 0.3,
                vx: -300, vy: rand(-30, 30), gravity: 0,
            });
        }

        // Spawn entities
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this._spawnWave();
            const scale = WORLD.baseSpeed / effSpeed;
            this.spawnTimer = rand(WORLD.spawnMinGap, WORLD.spawnMaxGap) * (0.5 + 0.5 * scale);
        }

        // Update entities
        for (const e of this.entities) {
            e.x -= effSpeed * dt;
            e.t += dt;
            if (e.type === 'coin') e.y = e.data.baseY + Math.sin(e.t * 6 + e.data.phase) * 4;

            // Magnet attraction
            if (this.powerups.magnet > 0 && (e.type === 'coin' || e.type === 'gem')) {
                const px = this.W * CHAR.x;
                const py = this.H * WORLD.groundY + this.character.y - CHAR.height / 2;
                const dx = px - e.x, dy = py - e.y;
                const d = Math.hypot(dx, dy);
                if (d < 260) {
                    const pull = 400 * dt;
                    e.x += (dx / d) * pull;
                    e.y += (dy / d) * pull;
                }
            }
        }

        // Collisions
        this._checkCollisions();

        // Cleanup
        this.entities = this.entities.filter(e => !e.dead && e.x > -120);

        // Shake decay
        if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);
        if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);

        // Notify HUD
        this.cb.onTick && this.cb.onTick({
            distance: Math.floor(this.distance),
            coins: this.coins,
            powerups: { ...this.powerups },
            combo: this.combo,
        });

        // Death settles → game over
        if (this.character.dead && this.character.y < this.H) {
            // keep drawing until clearly offscreen
            if (this.character.y > this.H * 0.6) {
                this.state = 'gameover';
                this.cb.onStateChange && this.cb.onStateChange('gameover');
            }
        }
    }

    _spawnWave() {
        const spawnX = this.W + 60;
        const groundY = this.H * WORLD.groundY;
        const difficulty = clamp((this.speed - WORLD.baseSpeed) / (WORLD.maxSpeed - WORLD.baseSpeed), 0, 1);

        const roll = Math.random();
        // Types: 'gap' (coin arc), 'low' (jump), 'high' (slide), 'double', 'powerup', 'coins'
        if (roll < 0.12 && this.distance > 300) {
            this._spawnPowerup(spawnX, groundY);
            return;
        }
        if (roll < 0.38) {
            // coin arc
            this._spawnCoinArc(spawnX, groundY, 6 + randi(0, 4));
        } else if (roll < 0.65) {
            // low obstacle (jump over)
            this._spawnLowObstacle(spawnX, groundY);
            if (Math.random() < 0.4) this._spawnCoinsAbove(spawnX, groundY, 4);
        } else if (roll < 0.85) {
            // high obstacle (slide under)
            this._spawnHighObstacle(spawnX, groundY);
            if (Math.random() < 0.4) this._spawnCoinsLow(spawnX, groundY, 4);
        } else if (difficulty > 0.3) {
            // double: low then high or vice versa
            this._spawnLowObstacle(spawnX, groundY);
            this._spawnHighObstacle(spawnX + 220, groundY);
        } else {
            this._spawnLowObstacle(spawnX, groundY);
        }

        // Occasional gem
        if (Math.random() < 0.06) {
            const gy = groundY - 80 - Math.random() * 120;
            this.entities.push(new Entity('gem', spawnX + rand(100, 300), gy, { phase: rand(0, Math.PI * 2), baseY: gy }));
        }
    }

    _spawnCoinArc(x, groundY, n) {
        for (let i = 0; i < n; i++) {
            const fx = x + i * 40;
            const fy = groundY - 80 - Math.sin((i / (n - 1)) * Math.PI) * 80;
            this.entities.push(new Entity('coin', fx, fy, { phase: rand(0, Math.PI * 2), baseY: fy }));
        }
    }
    _spawnCoinsAbove(x, groundY, n) {
        for (let i = 0; i < n; i++) {
            const fx = x + i * 36;
            const fy = groundY - 140;
            this.entities.push(new Entity('coin', fx, fy, { phase: rand(0, Math.PI * 2), baseY: fy }));
        }
    }
    _spawnCoinsLow(x, groundY, n) {
        for (let i = 0; i < n; i++) {
            const fx = x + i * 36;
            const fy = groundY - 30;
            this.entities.push(new Entity('coin', fx, fy, { phase: rand(0, Math.PI * 2), baseY: fy }));
        }
    }
    _spawnLowObstacle(x, groundY) {
        const kind = choose(['spike', 'crate', 'saw']);
        let w = 36, h = 36;
        if (kind === 'crate') { w = 44; h = 44; }
        if (kind === 'saw')   { w = 44; h = 44; }
        this.entities.push(new Entity('obstacle_low', x, groundY - h, { kind, w, h }));
    }
    _spawnHighObstacle(x, groundY) {
        const w = 60, h = 34;
        const y = groundY - CHAR.height + 4;
        this.entities.push(new Entity('obstacle_high', x, y, { w, h }));
    }
    _spawnPowerup(x, groundY) {
        const kind = choose(['shield', 'magnet', 'boost']);
        const y = groundY - 100 - Math.random() * 60;
        this.entities.push(new Entity('powerup', x, y, { kind, phase: rand(0, Math.PI * 2), baseY: y }));
    }

    _checkCollisions() {
        if (this.character.dead) return;
        const b = this.character.getBounds(this.W, this.H);
        for (const e of this.entities) {
            if (e.dead) continue;
            let ew = 40, eh = 40;
            if (e.type === 'coin') { ew = 26; eh = 26; }
            else if (e.type === 'gem') { ew = 30; eh = 30; }
            else if (e.type === 'powerup') { ew = 44; eh = 44; }
            else if (e.type === 'obstacle_low' || e.type === 'obstacle_high') { ew = e.data.w; eh = e.data.h; }

            const ex = e.x - ew / 2;
            const ey = e.y;
            if (b.x < ex + ew && b.x + b.w > ex && b.y < ey + eh && b.y + b.h > ey) {
                this._onCollide(e);
            }
        }
    }

    _onCollide(e) {
        if (e.type === 'coin') {
            e.dead = true;
            this.coins++;
            this.combo++;
            this.comboTimer = 1.5;
            this.particles.spawn({
                x: e.x, y: e.y + 13, count: 10,
                color: '#ffb14d', size: 3, life: 0.5,
                gravity: -100,
            });
            if (this.combo > 1) this.cb.onCombo && this.cb.onCombo(this.combo);
            this.audio.coin();
        } else if (e.type === 'gem') {
            e.dead = true;
            this.coins += 5;
            this.particles.spawn({
                x: e.x, y: e.y + 15, count: 18,
                color: '#5ae0ff', size: 4, life: 0.7,
            });
            this.particles.spawn({
                x: e.x, y: e.y + 15, count: 10,
                color: '#ff5aa8', size: 3, life: 0.6,
            });
            this.audio.gem();
        } else if (e.type === 'powerup') {
            e.dead = true;
            const kind = e.data.kind;
            const dur = kind === 'boost' ? 4 : 7;
            this.powerups[kind] = Math.max(this.powerups[kind], dur);
            this.particles.spawn({
                x: e.x, y: e.y + 20, count: 20,
                color: POWERUP_COLORS[kind], size: 4, life: 0.7,
            });
            this.audio.power();
            this.cb.onPowerup && this.cb.onPowerup(kind, dur);
        } else if (e.type === 'obstacle_low' || e.type === 'obstacle_high') {
            if (this.character.invincible > 0) return;
            if (this.powerups.shield > 0) {
                this.powerups.shield = 0;
                this.character.invincible = 1.0;
                e.dead = true;
                this.particles.spawn({
                    x: e.x, y: e.y + 20, count: 24,
                    color: '#5ae0ff', size: 4, life: 0.6,
                });
                this.audio.power();
                this._triggerShake(0.25);
                this.cb.onShieldBreak && this.cb.onShieldBreak();
                return;
            }
            // Die
            this.character.die();
            this.audio.hit();
            this.particles.spawn({
                x: e.x, y: e.y + 15, count: 26,
                color: '#ff3355', size: 5, life: 0.8,
            });
            this.particles.spawn({
                x: e.x, y: e.y + 15, count: 16,
                color: '#fff', size: 3, life: 0.6,
            });
            this._triggerShake(0.5);
            this.cb.onHit && this.cb.onHit();
        }
    }

    _triggerShake(d) {
        if (!this.shakeEnabled) return;
        this.shakeTimer = Math.max(this.shakeTimer, d);
    }

    // ---------- Rendering ----------
    _render() {
        const ctx = this.ctx;
        const W = this.W, H = this.H;

        ctx.clearRect(0, 0, W, H);

        ctx.save();
        if (this.shakeTimer > 0) {
            const s = this.shakeTimer * 10;
            ctx.translate(rand(-s, s), rand(-s, s));
        }

        this.parallax.draw(ctx, W, H);
        this.ground.draw(ctx, W, H);

        // Draw entities behind character
        for (const e of this.entities) this._drawEntity(ctx, e);

        // Character
        if (this.state !== 'menu') {
            this.character.draw(ctx, W, H, this._lastT);
        } else {
            // Menu character: running in place, centered-ish
            const groundY = H * WORLD.groundY;
            ctx.save();
            const cx = W * 0.5;
            ctx.translate(cx, groundY);
            // replicate run pose
            ctx.translate(0, 0);
            // We'll reuse character draw by temporarily overriding CHAR.x via direct draw
            // Instead, inline a simple runner:
            this._drawMenuRunner(ctx);
            ctx.restore();
        }

        // Shield aura
        if (this.powerups.shield > 0 && this.state === 'playing') {
            const b = this.character.getBounds(W, H);
            const cx = b.cx;
            const cy = b.y + b.h / 2;
            const r = Math.max(b.w, b.h) * 0.85;
            const pulse = 1 + Math.sin(now() / 120) * 0.08;
            ctx.save();
            ctx.strokeStyle = '#5ae0ff';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = '#5ae0ff';
            ctx.fill();
            ctx.restore();
        }

        // Particles on top
        this.particles.draw(ctx);

        // Speed line overlay when boosting
        if (this.powerups.boost > 0 && this.state === 'playing') {
            ctx.strokeStyle = 'rgba(255, 177, 77, 0.3)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 8; i++) {
                const y = rand(H * 0.1, H * 0.85);
                const x = rand(0, W);
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x - rand(30, 80), y);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    _drawMenuRunner(ctx) {
        // Simple inline: draw the current character at world origin
        const col = SKIN_COLORS[this.character.skin] || SKIN_COLORS.pink;
        const phase = this.character.runPhase;
        const bob = Math.sin(phase * 2) * 3;
        ctx.save();
        ctx.translate(0, bob);
        // Legs
        const ls1 = Math.sin(phase) * 14;
        const ls2 = Math.sin(phase + Math.PI) * 14;
        ctx.fillStyle = col.legs;
        ctx.save(); ctx.translate(-6, -22); ctx.rotate(ls1 * 0.04); ctx.fillRect(-4, 0, 8, 22); ctx.restore();
        ctx.save(); ctx.translate(6, -22); ctx.rotate(ls2 * 0.04); ctx.fillRect(-4, 0, 8, 22); ctx.restore();
        // Body
        ctx.fillStyle = col.body;
        ctx.fillRect(-16, -54, 32, 34);
        ctx.fillStyle = col.accent;
        ctx.fillRect(-16, -34, 32, 6);
        // Head
        ctx.fillStyle = col.skin;
        ctx.beginPath();
        ctx.arc(0, -62, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col.hair;
        ctx.beginPath();
        ctx.arc(0, -66, 14, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(4, -62, 3, 3);
        ctx.restore();

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 4, 20, 5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawEntity(ctx, e) {
        if (e.type === 'coin') this._drawCoin(ctx, e);
        else if (e.type === 'gem') this._drawGem(ctx, e);
        else if (e.type === 'powerup') this._drawPowerup(ctx, e);
        else if (e.type === 'obstacle_low') this._drawObstacleLow(ctx, e);
        else if (e.type === 'obstacle_high') this._drawObstacleHigh(ctx, e);
    }

    _drawCoin(ctx, e) {
        const spin = Math.sin(e.t * 8) * 0.9 + 0.1;
        const w = 22 * Math.abs(spin);
        const h = 22;
        ctx.save();
        ctx.translate(e.x, e.y + 13);
        const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        grad.addColorStop(0, '#c97a1f');
        grad.addColorStop(0.5, '#ffe08a');
        grad.addColorStop(1, '#ffb14d');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(-1, -6, 2, 12);
        // Glow
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ffb14d';
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawGem(ctx, e) {
        const pulse = 1 + Math.sin(e.t * 4) * 0.05;
        ctx.save();
        ctx.translate(e.x, e.y + 15);
        ctx.scale(pulse, pulse);
        // Glow
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#5ae0ff';
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // Diamond
        ctx.fillStyle = '#5ae0ff';
        ctx.beginPath();
        ctx.moveTo(0, -14); ctx.lineTo(12, 0); ctx.lineTo(0, 14); ctx.lineTo(-12, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#a8f0ff';
        ctx.beginPath();
        ctx.moveTo(0, -14); ctx.lineTo(12, 0); ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-2, -9, 2, 6);
        ctx.restore();
    }

    _drawPowerup(ctx, e) {
        const kind = e.data.kind;
        const color = POWERUP_COLORS[kind];
        const pulse = 1 + Math.sin(e.t * 5) * 0.08;
        ctx.save();
        ctx.translate(e.x, e.y + 22);
        ctx.scale(pulse, pulse);
        // Glow
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        // Bubble
        const grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, 20);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.4, color);
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Icon
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        if (kind === 'shield') {
            ctx.beginPath();
            ctx.moveTo(0, -10); ctx.lineTo(8, -6); ctx.lineTo(8, 2);
            ctx.quadraticCurveTo(8, 10, 0, 12);
            ctx.quadraticCurveTo(-8, 10, -8, 2);
            ctx.lineTo(-8, -6);
            ctx.closePath();
            ctx.stroke();
        } else if (kind === 'magnet') {
            ctx.beginPath();
            ctx.moveTo(-8, -8); ctx.lineTo(-8, 4);
            ctx.arc(0, 4, 8, Math.PI, 0, true);
            ctx.moveTo(8, 4); ctx.lineTo(8, -8);
            ctx.stroke();
            ctx.fillRect(-10, -10, 5, 3);
            ctx.fillRect(5, -10, 5, 3);
        } else if (kind === 'boost') {
            ctx.beginPath();
            ctx.moveTo(2, -10);
            ctx.lineTo(-6, 2);
            ctx.lineTo(-1, 2);
            ctx.lineTo(-4, 11);
            ctx.lineTo(6, -2);
            ctx.lineTo(1, -2);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    _drawObstacleLow(ctx, e) {
        const { kind, w, h } = e.data;
        const x = e.x - w / 2, y = e.y;
        if (kind === 'spike') {
            // Triple spike
            ctx.fillStyle = '#3a2757';
            ctx.fillRect(x, y + h - 6, w, 6);
            ctx.fillStyle = '#ff5aa8';
            for (let i = 0; i < 3; i++) {
                const sx = x + i * (w / 3);
                ctx.beginPath();
                ctx.moveTo(sx, y + h - 6);
                ctx.lineTo(sx + w / 6, y);
                ctx.lineTo(sx + w / 3, y + h - 6);
                ctx.closePath();
                ctx.fill();
            }
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            for (let i = 0; i < 3; i++) {
                const sx = x + i * (w / 3);
                ctx.beginPath();
                ctx.moveTo(sx + 2, y + h - 6);
                ctx.lineTo(sx + w / 6, y + 4);
                ctx.lineTo(sx + w / 6 + 1, y + h - 6);
                ctx.closePath();
                ctx.fill();
            }
        } else if (kind === 'crate') {
            ctx.fillStyle = '#5c3b1e';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = '#2a1a0a';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, w, h);
            ctx.beginPath();
            ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
            ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(x, y, w, 4);
        } else if (kind === 'saw') {
            const cx = x + w / 2, cy = y + h / 2;
            const rot = e.t * 8;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rot);
            ctx.fillStyle = '#c0c0d0';
            ctx.beginPath();
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                const r = (i % 2 === 0) ? 22 : 14;
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ff3355';
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#2a2a3e';
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    _drawObstacleHigh(ctx, e) {
        const { w, h } = e.data;
        const x = e.x - w / 2, y = e.y;
        // Beam/pipe hanging
        ctx.fillStyle = '#1f2756';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#ff3355';
        ctx.fillRect(x, y, w, 5);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(x, y + 5, w, 3);
        // Warning stripes
        ctx.fillStyle = '#ffb14d';
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(x + i * 16, y + h - 8, 8, 8);
        }
        // Chain from top of screen
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, 0);
        ctx.lineTo(x + w / 2, y);
        ctx.stroke();
    }
}

const POWERUP_COLORS = {
    shield: '#5ae0ff',
    magnet: '#ff5aa8',
    boost:  '#ffb14d',
};

// Expose skin rendering for preview cards
function renderSkinPreview(canvas, skinKey) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const col = SKIN_COLORS[skinKey] || SKIN_COLORS.pink;
    ctx.save();
    ctx.translate(w / 2, h * 0.9);
    const scale = Math.min(w, h) / 100;
    ctx.scale(scale, scale);
    // Legs
    ctx.fillStyle = col.legs;
    ctx.fillRect(-10, -22, 8, 22);
    ctx.fillRect(2, -22, 8, 22);
    ctx.fillStyle = col.shoes;
    ctx.fillRect(-12, -4, 12, 6);
    ctx.fillRect(0, -4, 12, 6);
    // Body
    ctx.fillStyle = col.body;
    ctx.fillRect(-16, -54, 32, 34);
    ctx.fillStyle = col.accent;
    ctx.fillRect(-16, -34, 32, 6);
    // Head
    ctx.fillStyle = col.skin;
    ctx.beginPath();
    ctx.arc(0, -62, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col.hair;
    ctx.beginPath();
    ctx.arc(0, -66, 14, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(4, -62, 3, 3);
    if (col.visor) {
        ctx.fillStyle = col.visor;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(-2, -64, 14, 5);
        ctx.globalAlpha = 1;
    }
    ctx.restore();
}

// Export to window
window.SkylineDash = { Game, SKIN_COLORS, renderSkinPreview };

})();
