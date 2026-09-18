import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  color: string;
  alpha: number;
  pulsePhase: number;
}

interface PulsePacket {
  fromIdx: number;
  toIdx: number;
  progress: number;
  speed: number;
  color: string;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

export const InteractiveBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Dynamic scale and sizing
    const resizeCanvas = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      initParticles();
    };

    // Pointer state
    const mouse = {
      x: width * 0.5,
      y: height * 0.4,
      targetX: width * 0.5,
      targetY: height * 0.4,
      isActive: false,
      radius: 140,
    };

    let particles: Particle[] = [];
    let packets: PulsePacket[] = [];
    let shockwaves: Shockwave[] = [];

    // Palette: Cyan, Electric Blue, Deep Cobalt, Violet
    const colors = [
      'rgba(6, 182, 212, ',   // cyan
      'rgba(59, 130, 246, ',  // blue
      'rgba(14, 165, 233, ',  // sky
      'rgba(99, 102, 241, ',  // indigo
    ];

    const initParticles = () => {
      const isMobile = width < 640;
      const count = isMobile ? 38 : 75;
      particles = [];
      packets = [];

      for (let i = 0; i < count; i++) {
        const colorBase = colors[Math.floor(Math.random() * colors.length)];
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.45,
          vy: (Math.random() - 0.5) * 0.45,
          baseRadius: Math.random() * 1.8 + 1.0,
          color: colorBase,
          alpha: Math.random() * 0.4 + 0.2,
          pulsePhase: Math.random() * Math.PI * 2,
        });
      }
    };

    resizeCanvas();

    // Spawn quantum data packets along connections
    const spawnPacket = () => {
      if (particles.length < 2 || packets.length > 8) return;
      const i = Math.floor(Math.random() * particles.length);
      // Find a near neighbor
      let bestDist = 130;
      let targetIdx = -1;
      for (let j = 0; j < particles.length; j++) {
        if (i === j) continue;
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) {
          bestDist = d;
          targetIdx = j;
        }
      }

      if (targetIdx !== -1) {
        packets.push({
          fromIdx: i,
          toIdx: targetIdx,
          progress: 0,
          speed: Math.random() * 0.02 + 0.015,
          color: '#22d3ee',
        });
      }
    };

    const packetInterval = setInterval(spawnPacket, 600);

    // Event listeners
    const onMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.isActive = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouse.targetX = e.touches[0].clientX;
        mouse.targetY = e.touches[0].clientY;
        mouse.isActive = true;
      }
    };

    const onClick = (e: MouseEvent | TouchEvent) => {
      const clientX = 'clientX' in e ? e.clientX : (e.touches[0]?.clientX || width / 2);
      const clientY = 'clientY' in e ? e.clientY : (e.touches[0]?.clientY || height / 2);
      shockwaves.push({
        x: clientX,
        y: clientY,
        radius: 5,
        maxRadius: Math.min(width, height) * 0.35,
        alpha: 0.6,
      });
    };

    window.addEventListener('resize', resizeCanvas, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('click', onClick, { passive: true });

    let lastTime = performance.now();
    let isTabActive = true;

    const onVisibilityChange = () => {
      isTabActive = !document.hidden;
      if (isTabActive) {
        lastTime = performance.now();
        loop(performance.now());
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // 120Hz Animation Loop
    const loop = (currentTime: number) => {
      if (!isTabActive) return;

      const elapsed = currentTime - lastTime;
      lastTime = currentTime;
      // Normalize delta time to 60fps base (16.67ms = 1.0)
      const dt = Math.min(elapsed / 16.667, 2.5);

      // Smooth mouse interpolation
      mouse.x += (mouse.targetX - mouse.x) * 0.1 * dt;
      mouse.y += (mouse.targetY - mouse.y) * 0.1 * dt;

      // 1. Draw Deep Cyber Canvas Background
      ctx.fillStyle = '#07080a';
      ctx.fillRect(0, 0, width, height);

      // 2. Subtle Interactive Radial Glow behind cursor
      if (mouse.isActive) {
        const rad = ctx.createRadialGradient(mouse.x, mouse.y, 10, mouse.x, mouse.y, mouse.radius * 2);
        rad.addColorStop(0, 'rgba(6, 182, 212, 0.05)');
        rad.addColorStop(0.5, 'rgba(37, 99, 235, 0.02)');
        rad.addColorStop(1, 'rgba(7, 8, 10, 0)');
        ctx.fillStyle = rad;
        ctx.fillRect(0, 0, width, height);
      }

      // 3. Update & Draw Shockwaves
      for (let s = shockwaves.length - 1; s >= 0; s--) {
        const sw = shockwaves[s];
        sw.radius += 4.5 * dt;
        sw.alpha *= Math.pow(0.96, dt);

        if (sw.alpha < 0.02 || sw.radius >= sw.maxRadius) {
          shockwaves.splice(s, 1);
          continue;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34, 211, 238, ${sw.alpha * 0.35})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // 4. Update and Draw Particles
      const maxConnectDistSq = 120 * 120;
      const mouseRadiusSq = mouse.radius * mouse.radius;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Autonomous Drift
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.pulsePhase += 0.03 * dt;

        // Wrap around boundaries
        if (p.x < -10) p.x = width + 10;
        else if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        else if (p.y > height + 10) p.y = -10;

        // Mouse interaction (gentle attraction / magnetic displacement)
        if (mouse.isActive) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < mouseRadiusSq && distSq > 1) {
            const dist = Math.sqrt(distSq);
            const force = (1 - dist / mouse.radius) * 0.08 * dt;
            p.x += (dx / dist) * force * 15;
            p.y += (dy / dist) * force * 15;
          }
        }

        // Pulse radius
        const currentRadius = p.baseRadius + Math.sin(p.pulsePhase) * 0.4;

        // Draw particle node
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, currentRadius), 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.fill();

        // Connect to nearby neighbors
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < maxConnectDistSq) {
            const ratio = 1 - distSq / maxConnectDistSq;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(6, 182, 212, ${ratio * 0.14})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      // 5. Update & Draw Quantum Packets
      for (let k = packets.length - 1; k >= 0; k--) {
        const pk = packets[k];
        pk.progress += pk.speed * dt;
        if (pk.progress >= 1 || !particles[pk.fromIdx] || !particles[pk.toIdx]) {
          packets.splice(k, 1);
          continue;
        }

        const p1 = particles[pk.fromIdx];
        const p2 = particles[pk.toIdx];
        const curX = p1.x + (p2.x - p1.x) * pk.progress;
        const curY = p1.y + (p2.y - p1.y) * pk.progress;

        ctx.beginPath();
        ctx.arc(curX, curY, 2.0, 0, Math.PI * 2);
        ctx.fillStyle = pk.color;
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0; // reset
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      clearInterval(packetInterval);
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('click', onClick);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-0 select-none opacity-80"
    />
  );
};
