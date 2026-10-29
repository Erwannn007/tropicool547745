// Unified input: keyboard + mouse (pointer lock), touch (virtual stick + look
// drag + buttons) and Gamepad API (DualSense / Xbox / AYN Thor built-in pad).

const DEAD = 0.14;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export class Input {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.sprint = false;
    this.pressed = new Set(); // edge-triggered actions this frame: jump, action, menu, back, up, down, left, right
    this.keys = new Set();
    this.sensitivity = 1;
    this.enabled = false;
    this.lastDevice = 'touch';
    this.gamepadName = '';
    this.prevButtons = [];
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookTouch = { id: null, x: 0, y: 0 };
    this.ui = ui;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
      if (e.code === 'Space') this.pressed.add('jump');
      if (e.code === 'KeyE' || e.code === 'KeyF') this.pressed.add('action');
      if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyM') { this.pressed.add('menu'); e.preventDefault(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.pointerType === 'touch') return;
      if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch (_) { /* unsupported */ } return; }
      if (e.button === 0) this.pressed.add('action');
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.look.x += e.movementX * 0.0022 * this.sensitivity;
        this.look.y += e.movementY * 0.0022 * this.sensitivity;
        this.lastDevice = 'keyboard';
      }
    });

    // touch: left half = floating stick, right half = look drag
    const opts = { passive: false };
    canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), opts);
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), opts);
    canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), opts);
    canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), opts);

    addEventListener('gamepadconnected', (e) => {
      this.gamepadName = e.gamepad.id;
      this.lastDevice = 'gamepad';
      ui?.onGamepad?.(e.gamepad.id);
    });
  }

  onTouchStart(e) {
    e.preventDefault();
    this.lastDevice = 'touch';
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && this.stick.id === null) {
        this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
        this.ui?.showStick?.(t.clientX, t.clientY);
      } else if (this.lookTouch.id === null) {
        this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY, t0: performance.now(), moved: 0 };
      }
    }
  }
  onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.stick.id) {
        const R = 56;
        let dx = (t.clientX - this.stick.ox) / R, dy = (t.clientY - this.stick.oy) / R;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        this.stick.x = dx; this.stick.y = dy;
        this.ui?.moveStick?.(dx * R, dy * R);
      } else if (t.identifier === this.lookTouch.id) {
        const dx = t.clientX - this.lookTouch.x, dy = t.clientY - this.lookTouch.y;
        this.look.x += dx * 0.0052 * this.sensitivity;
        this.look.y += dy * 0.0052 * this.sensitivity;
        this.lookTouch.moved += Math.abs(dx) + Math.abs(dy);
        this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
      }
    }
  }
  onTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.stick.id) {
        this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
        this.ui?.hideStick?.();
      } else if (t.identifier === this.lookTouch.id) {
        this.lookTouch.id = null;
      }
    }
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.gamepad = gp;
    if (!gp) return { x: 0, y: 0 };
    const b = gp.buttons.map((x) => x.pressed || x.value > 0.5);
    const edge = (i) => b[i] && !this.prevButtons[i];
    if (edge(0)) this.pressed.add('jump'), this.pressed.add('confirm');
    if (edge(1)) this.pressed.add('back');
    if (edge(2) || edge(7) || edge(5)) this.pressed.add('action');
    if (edge(9) || edge(8)) this.pressed.add('menu');
    if (edge(12)) this.pressed.add('up');
    if (edge(13)) this.pressed.add('down');
    if (edge(14)) this.pressed.add('left');
    if (edge(15)) this.pressed.add('right');
    if (edge(3)) this.pressed.add('journal');
    const ax = gp.axes;
    const mx = dz(ax[0] || 0), my = dz(ax[1] || 0);
    const lx = dz(ax[2] || 0), ly = dz(ax[3] || 0);
    if (b.some(Boolean) || Math.abs(mx) + Math.abs(my) + Math.abs(lx) + Math.abs(ly) > 0) this.lastDevice = 'gamepad';
    this.padSprint = b[10] || b[6];
    this.padLook = { x: Math.sign(lx) * lx * lx, y: Math.sign(ly) * ly * ly };
    // menu navigation with the left stick too
    const stickY = ax[1] || 0;
    if (stickY < -0.6 && !(this.prevStickY < -0.6)) this.pressed.add('up');
    if (stickY > 0.6 && !(this.prevStickY > 0.6)) this.pressed.add('down');
    const stickX = ax[0] || 0;
    if (stickX < -0.6 && !(this.prevStickX < -0.6)) this.pressed.add('left');
    if (stickX > 0.6 && !(this.prevStickX > 0.6)) this.pressed.add('right');
    this.prevStickY = stickY; this.prevStickX = stickX;
    this.prevButtons = b;
    return { x: mx, y: my };
  }

  rumble(strength = 0.5, ms = 120) {
    const gp = this.gamepad;
    try {
      gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 });
    } catch (_) { /* unsupported */ }
    if (this.lastDevice === 'touch') navigator.vibrate?.(ms * 0.5);
  }

  // called once per frame; returns movement for this frame
  update(dt) {
    const pad = this.pollGamepad();
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.keys.has('KeyZ')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.keys.has('KeyQ')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    x += this.stick.x + pad.x;
    y += this.stick.y + pad.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = x; this.move.y = y;
    this.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || !!this.padSprint || Math.hypot(this.stick.x, this.stick.y) > 0.97;
    if (this.padLook) {
      this.look.x += this.padLook.x * 2.8 * dt * this.sensitivity;
      this.look.y += this.padLook.y * 2.0 * dt * this.sensitivity;
    }
  }

  consumeLook() { const l = { ...this.look }; this.look.x = 0; this.look.y = 0; return l; }
  endFrame() { this.pressed.clear(); }
}
