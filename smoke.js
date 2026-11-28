export function createSmoke(cruiser) {
  const plumeMap = new THREE.TextureLoader().load('./smoke.png');
  const smokePuffs = [];
  cruiser.traverse(part => {
    if (part.name !== 'Устье трубы') return;
    const origin = cruiser.worldToLocal(part.getWorldPosition(new THREE.Vector3()));
    const stackPhase = smokePuffs.length ? 1.7 : 0;
    for (let i = 0; i < 16; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: plumeMap, color: 0x747980, transparent: true, depthWrite: false
      }));
      smokePuffs.push({sprite, origin, offset: (i + stackPhase) / 16,
        phase: i * 2.39996 + stackPhase});
    }
  });
  for (const puff of smokePuffs) cruiser.add(puff.sprite);

  function updateSmoke(time) {
    for (const {sprite, origin, offset, phase} of smokePuffs) {
      const t = (time * 0.21 + offset) % 1;
      const sway = Math.sin(phase + time * 0.62);
      sprite.position.copy(origin);
      sprite.position.x -= 0.12 * t + 5.7 * t * t;
      sprite.position.y += 0.12 + 4.5 * t - 1.4 * t * t;
      sprite.position.z += t * (0.38 * sway + 0.25 * t);
      const size = 0.43 + 2.25 * t;
      sprite.scale.set(size * (1 + 0.28 * t), size, 1);
      sprite.material.rotation = phase + 0.28 * time;
      sprite.material.opacity = 0.23 * Math.min(1, 18 * t) * (1 - t) ** 1.25;
    }
  }
  return updateSmoke;
}
