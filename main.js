import { createCruiser } from './cruiser.js';
import { addOcean } from './ocean.js';
import { createSmoke } from './smoke.js';

const canvas = document.querySelector('#ocean');
const errorMessage = document.querySelector('#error');

function startOcean() {
  const {
    BufferGeometry, Float32BufferAttribute, Matrix3, Mesh,
    PerspectiveCamera, Scene, ShaderMaterial, Vector3, WebGLRenderer
  } = THREE;

  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
  const scene = new Scene();
  const camera = new PerspectiveCamera(51, 1, 0.1, 1000);
  const sunElevation = 0.236;
  const sunAzimuth = 0.305;
  const uniforms = {
    uCameraBasis: { value: new Matrix3() },
    uCameraPosition: { value: camera.position },
    uTanHalfFov: { value: Math.tan(camera.fov * Math.PI / 360) },
    uAspect: { value: 1 },
    uPhase: { value: 0 },
    uTime: { value: 0 },
    uSun: { value: new Vector3(
      Math.sin(sunAzimuth) * Math.cos(sunElevation),
      Math.sin(sunElevation),
      -Math.cos(sunAzimuth) * Math.cos(sunElevation)
    ) }
  };
  const startPosition = new Vector3(1.3, 2.45, -0.8);
  camera.position.copy(startPosition);
  camera.rotation.order = 'YXZ';

  addOcean(scene, uniforms);

  const cruiser = createCruiser(renderer);
  cruiser.position.set(1.3, -0.035, -40);
  cruiser.rotation.y = 0.38;
  const waterline = new THREE.Plane(new Vector3(0, 1, 0), 0);
  renderer.localClippingEnabled = true;
  cruiser.traverse(part => {
    if (part.material) part.material.clippingPlanes = [waterline];
  });
  scene.add(cruiser);
  scene.add(new THREE.HemisphereLight(0xfff8e9, 0x88969e, 1.47));
  const sunlight = new THREE.DirectionalLight(0xfff0d9, 2.1);
  const shadowCenter = cruiser.position.clone();
  sunlight.target.position.copy(shadowCenter);
  scene.add(sunlight.target);
  sunlight.position.copy(shadowCenter).addScaledVector(uniforms.uSun.value, 55);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, {left:-21, right:21, top:12, bottom:-12, near:20, far:90});
  sunlight.shadow.camera.updateProjectionMatrix();
  sunlight.shadow.normalBias = 0.016;
  sunlight.shadow.bias = -0.00016;
  cruiser.traverse(part => {
    if (part.isMesh) part.castShadow = part.receiveShadow = true;
  });
  // The ocean is screen-space. Catch the ship's shadow on its world-space waterline.
  const waterShadow = new Mesh(new THREE.PlaneGeometry(110, 110),
    new THREE.ShadowMaterial({color:0x182a31, opacity:0.23, depthWrite:false}));
  waterShadow.rotation.x = -Math.PI / 2;
  waterShadow.position.set(shadowCenter.x, 0, shadowCenter.z);
  waterShadow.receiveShadow = true;
  waterShadow.renderOrder = -1;
  scene.add(waterShadow);
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  scene.add(sunlight);

  const updateSmoke = createSmoke(cruiser);

  const view = { yaw: 0, pitch: -0.15 };
  const minimap = document.querySelector('#minimap');
  const map = minimap.getContext('2d');
  // World size in game units. Wheel speed is ~28 units/s (about 10 notches per second):
  // centre to north/south edge = 280 units ~ 10 s, centre to east/west edge = 200 units ~ 7 s.
  const worldWidth = 400;
  const worldHeight = 560;
  // Minimap drawing area in canvas px (the whole world, scaled down).
  const mapWidth = 200;
  const mapHeight = 280;
  const mapScale = mapWidth / worldWidth;
  const mapMargin = 6;
  const mapCanvasWidth = minimap.width;
  const mapCanvasHeight = minimap.height;
  const gridStep = 20;
  let mapX;
  let mapZ;
  let mapYaw;
  const moveSpeed = 3;
  const minCameraHeight = 0.1;
  const wheelStep = 2.8;
  const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight']);
  const heldKeys = new Set();
  const pendingScroll = new Vector3();
  let previousTime = null;
  let activePointer = null;
  let lastX = 0;
  let lastY = 0;
  let atDefaultView = true;
  let contextLost = false;

  const pickRay = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const selectable = [];
  cruiser.traverse(part => { if (part.isMesh) selectable.push(part); });
  let aboard = false;
  let boarding = null;

  function pointsAtCruiser(event) {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.set(2 * (event.clientX - rect.left) / rect.width - 1,
      1 - 2 * (event.clientY - rect.top) / rect.height);
    pickRay.setFromCamera(pointerNdc, camera);
    return pickRay.intersectObjects(selectable, false).some(hit => hit.point.y >= 0);
  }

  function angleDelta(from, to) {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
  }

  function boardCruiser() {
    const wasDefault = atDefaultView;
    aboard = true;
    atDefaultView = false;
    clearMovement();
    canvas.style.cursor = '';
    const focus = cruiser.localToWorld(new Vector3(-3, 1.6, 0));
    const end = cruiser.localToWorld(new Vector3(-26, 9, 0));
    const bearing = p => Math.atan2(p.x - focus.x, p.z - focus.z);
    const radius = p => Math.hypot(p.x - focus.x, p.z - focus.z);
    boarding = {
      focus, wasDefault, leaving: false, elapsed: 0, startY: camera.position.y, endY: end.y,
      startRadius: radius(camera.position), endRadius: radius(end),
      startBearing: bearing(camera.position),
      sweep: angleDelta(bearing(camera.position), bearing(end)),
      startYaw: view.yaw, startPitch: view.pitch
    };
  }

  function advanceBoarding(dt) {
    const b = boarding;
    b.elapsed = THREE.MathUtils.clamp(b.elapsed + (b.leaving ? -dt : dt), 0, 1.5);
    const t = Math.min(b.elapsed / 1.5, 1);
    const ease = t * t * (3 - 2 * t);
    const angle = b.startBearing + b.sweep * ease;
    const radius = THREE.MathUtils.lerp(b.startRadius, b.endRadius, ease);
    const lift = Math.sin(Math.PI * ease) * 3.5;
    camera.position.set(b.focus.x + radius * Math.sin(angle),
      THREE.MathUtils.lerp(b.startY, b.endY, ease) + lift,
      b.focus.z + radius * Math.cos(angle));
    // Follow the ship around the arc while blending out the initial free look.
    const lock = Math.min(1, ease * 3);
    const facing = -angle;
    view.yaw = facing - (1 - lock) * angleDelta(b.startYaw, -b.startBearing);
    const pitch = Math.atan2(b.focus.y - camera.position.y, radius);
    view.pitch = THREE.MathUtils.lerp(b.startPitch, pitch, lock);
    if (b.leaving && t === 0) {
      view.yaw = b.startYaw;
      atDefaultView = b.wasDefault;
      aboard = false;
      boarding = null;
    }
  }

  function clearMovement() {
    heldKeys.clear();
    pendingScroll.set(0, 0, 0);
  }

  function moveCamera(elapsed) {
    const forward = Number(heldKeys.has('KeyW')) - Number(heldKeys.has('KeyS'));
    const right = Number(heldKeys.has('KeyD')) - Number(heldKeys.has('KeyA'));
    const descending = heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight');
    const vertical = Number(heldKeys.has('Space')) - Number(descending);
    const directionLength = Math.hypot(forward, right, vertical);
    if (directionLength > 0) {
      const distance = elapsed * moveSpeed / directionLength;
      const sinYaw = Math.sin(view.yaw);
      const cosYaw = Math.cos(view.yaw);
      camera.position.x += (forward * sinYaw + right * cosYaw) * distance;
      camera.position.z += (-forward * cosYaw + right * sinYaw) * distance;
      camera.position.y = Math.max(minCameraHeight, camera.position.y + vertical * distance);
    }

    // Ease out each scroll impulse. Its direction is set when the input arrives.
    const scrollFraction = 1 - Math.exp(-elapsed / 0.065);
    camera.position.addScaledVector(pendingScroll, scrollFraction);
    const halfWidth = worldWidth / 2;
    const halfHeight = worldHeight / 2;
    camera.position.x = Math.max(startPosition.x - halfWidth,
      Math.min(startPosition.x + halfWidth, camera.position.x));
    camera.position.z = Math.max(startPosition.z - halfHeight,
      Math.min(startPosition.z + halfHeight, camera.position.z));
    pendingScroll.multiplyScalar(1 - scrollFraction);
    if (pendingScroll.lengthSq() < 1e-10) pendingScroll.set(0, 0, 0);
  }

  function roundedRect(x, y, w, h, r) {
    map.beginPath();
    map.moveTo(x + r, y);
    map.arcTo(x + w, y, x + w, y + h, r);
    map.arcTo(x + w, y + h, x, y + h, r);
    map.arcTo(x, y + h, x, y, r);
    map.arcTo(x, y, x + w, y, r);
    map.closePath();
  }

  function drawMinimap() {
    const { x, z } = camera.position;
    const { yaw } = view;
    if (!map || (x === mapX && z === mapZ && yaw === mapYaw)) return;
    mapX = x;
    mapZ = z;
    mapYaw = yaw;

    const west = mapMargin;
    const north = mapMargin;
    const east = mapMargin + mapWidth;
    const south = mapMargin + mapHeight;
    const centerX = west + mapWidth / 2;
    const centerY = north + mapHeight / 2;
    map.clearRect(0, 0, mapCanvasWidth, mapCanvasHeight);

    map.save();
    roundedRect(west, north, mapWidth, mapHeight, 4);
    map.clip();

    // Translucent glass: the sea stays visible through the map.
    map.fillStyle = 'rgba(10, 36, 54, 0.30)';
    map.fillRect(west, north, mapWidth, mapHeight);

    // Grid every 50 world units.
    const gridPx = 50 * mapScale;
    map.beginPath();
    for (let gx = centerX - Math.floor(mapWidth / 2 / gridPx) * gridPx; gx < east; gx += gridPx) {
      map.moveTo(Math.round(gx) + 0.5, north);
      map.lineTo(Math.round(gx) + 0.5, south);
    }
    for (let gz = centerY - Math.floor(mapHeight / 2 / gridPx) * gridPx; gz < south; gz += gridPx) {
      map.moveTo(west, Math.round(gz) + 0.5);
      map.lineTo(east, Math.round(gz) + 0.5);
    }
    map.strokeStyle = 'rgba(235, 247, 252, 0.20)';
    map.lineWidth = 1;
    map.stroke();

    // Camera: thin view lines, faint fill and a small marker.
    map.translate(centerX + (x - startPosition.x) * mapScale, centerY + (z - startPosition.z) * mapScale);
    map.rotate(yaw);
    const reach = 52;
    const half = 0.46;
    map.beginPath();
    map.moveTo(0, 0);
    map.lineTo(Math.sin(-half) * reach, -Math.cos(half) * reach);
    map.lineTo(Math.sin(half) * reach, -Math.cos(half) * reach);
    map.closePath();
    map.fillStyle = 'rgba(255, 255, 255, 0.10)';
    map.fill();
    map.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    map.lineWidth = 1;
    map.stroke();
    map.beginPath();
    map.moveTo(0, -6);
    map.lineTo(4.5, 4.5);
    map.lineTo(0, 2);
    map.lineTo(-4.5, 4.5);
    map.closePath();
    map.fillStyle = '#ffffff';
    map.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    map.lineWidth = 1.5;
    map.lineJoin = 'round';
    map.stroke();
    map.fill();
    map.restore();

    // Thin frame.
    roundedRect(west + 0.5, north + 0.5, mapWidth - 1, mapHeight - 1, 4);
    map.strokeStyle = 'rgba(255, 255, 255, 0.50)';
    map.lineWidth = 1;
    map.stroke();

    // Small compass letters just inside the edges.
    map.font = '600 10px system-ui, sans-serif';
    map.textAlign = 'center';
    map.textBaseline = 'middle';
    map.fillStyle = 'rgba(255, 255, 255, 0.75)';
    map.fillText('С', centerX, north + 9);
    map.fillText('Ю', centerX, south - 9);
    map.fillText('З', west + 9, centerY);
    map.fillText('В', east - 9, centerY);

    // Position, bottom-left, no background.
    const eastward = Math.round(x - startPosition.x);
    const northward = Math.round(startPosition.z - z);
    map.font = '600 10px ui-monospace, system-ui, sans-serif';
    map.textAlign = 'left';
    map.fillStyle = 'rgba(255, 255, 255, 0.65)';
    map.fillText(Math.abs(eastward) + (eastward >= 0 ? ' В' : ' З') + ' · ' +
      Math.abs(northward) + (northward >= 0 ? ' С' : ' Ю'), west + 18, south - 9);
  }

  function draw(now) {
    if (contextLost) return;
    if (previousTime !== null) {
      const elapsed = Math.min((now - previousTime) / 1000, 0.12);
      // All shader rates are integral, so the phase can wrap without a jump.
      uniforms.uPhase.value = (uniforms.uPhase.value + elapsed * Math.PI / 32) % (2 * Math.PI);
      uniforms.uTime.value += elapsed;
      if (boarding && (boarding.leaving || boarding.elapsed < 1.5)) advanceBoarding(elapsed);
      else if (!aboard) moveCamera(elapsed);
    }
    previousTime = now;
    camera.rotation.set(view.pitch, -view.yaw, 0);
    camera.updateMatrixWorld();
    uniforms.uCameraBasis.value.setFromMatrix4(camera.matrixWorld);
    updateSmoke(uniforms.uTime.value);
    renderer.render(scene, camera);
    drawMinimap();
  }

  function resetView() {
    atDefaultView = true;
    view.yaw = camera.aspect < 0.85 ? 0.17 : 0;
    view.pitch = -0.15;
  }

  function resize() {
    camera.aspect = innerWidth / Math.max(innerHeight, 1);
    camera.updateProjectionMatrix();
    uniforms.uAspect.value = camera.aspect;
    const pixelBudget = 1800000;
    const density = Math.sqrt(pixelBudget / Math.max(1, innerWidth * innerHeight));
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75, density));
    renderer.setSize(innerWidth, innerHeight, false);
    if (atDefaultView) resetView();
    if (map) {
      const mapPixelRatio = Math.min(devicePixelRatio || 1, 2);
      minimap.width = Math.max(1, Math.round(minimap.clientWidth * mapPixelRatio));
      minimap.height = Math.max(1, Math.round(minimap.clientHeight * mapPixelRatio));
      map.setTransform(minimap.width / mapCanvasWidth, 0, 0, minimap.height / mapCanvasHeight, 0, 0);
      mapYaw = undefined;
      drawMinimap();
    }
  }

  function turn(yaw, pitch) {
    atDefaultView = false;
    view.yaw = (view.yaw + yaw) % (2 * Math.PI);
    view.pitch = Math.max(-1.45, Math.min(1.45, view.pitch + pitch));
  }

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener('pointerdown', (event) => {
    if (aboard || contextLost || activePointer !== null || (event.button !== 0 && event.button !== 2)) return;
    if (event.pointerType === 'mouse' && event.button === 0) {
      if (pointsAtCruiser(event)) boardCruiser();
      return;
    }
    activePointer = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (aboard || contextLost) return;
    if (activePointer === null && event.pointerType === 'mouse') {
      canvas.style.cursor = pointsAtCruiser(event) ? 'pointer' : '';
      return;
    }
    if (event.pointerId !== activePointer) return;
    const deltaX = lastX - event.clientX;
    const deltaY = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (event.pointerType === 'mouse' && !(event.buttons & 2)) return;
    const radiansPerPixel = 1.5 * uniforms.uTanHalfFov.value / Math.max(innerHeight, 1);
    const horizontalDirection = event.pointerType === 'mouse' ? -1 : 1;
    turn(horizontalDirection * deltaX * radiansPerPixel, deltaY * radiansPerPixel);
  });

  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(name, (event) => {
      if (event.pointerId === activePointer) activePointer = null;
    });
  }

  canvas.addEventListener('wheel', (event) => {
    if (aboard || event.ctrlKey || event.metaKey || contextLost || event.deltaY === 0) return;
    event.preventDefault();
    const pixels = event.deltaY * (
      event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? innerHeight : 1
    );
    const distance = -Math.max(-3, Math.min(3, pixels / 100)) * wheelStep;
    pendingScroll.x += Math.sin(view.yaw) * distance;
    pendingScroll.z -= Math.cos(view.yaw) * distance;
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || contextLost) return;
    if (aboard) {
      if (event.code === 'KeyQ') {
        boarding.leaving = true;
        event.preventDefault();
      }
      return;
    }
    if (movementKeys.has(event.code)) {
      heldKeys.add(event.code);
      if (event.code === 'Space' || event.code.startsWith('Key')) event.preventDefault();
      return;
    }
    const step = 0.065;
    if (event.key === 'ArrowLeft') turn(-step, 0);
    else if (event.key === 'ArrowRight') turn(step, 0);
    else if (event.key === 'ArrowUp') turn(0, step);
    else if (event.key === 'ArrowDown') turn(0, -step);
    else if (event.key === 'Home') {
      clearMovement();
      camera.position.copy(startPosition);
      resetView();
    } else return;
    event.preventDefault();
  });

  window.addEventListener('keyup', (event) => heldKeys.delete(event.code));
  window.addEventListener('blur', clearMovement);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearMovement();
  });

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    clearMovement();
    errorMessage.textContent = 'Графический контекст временно недоступен.';
    errorMessage.hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    renderer.shadowMap.needsUpdate = true;
    contextLost = false;
    previousTime = null;
    errorMessage.hidden = true;
    resize();
  });

  window.addEventListener('resize', resize);
  resize();
  renderer.setAnimationLoop(draw);
}

try {
  startOcean();
} catch (error) {
  console.error(error);
  errorMessage.textContent = 'Для сцены нужен браузер с поддержкой WebGL 2.';
  errorMessage.hidden = false;
}
