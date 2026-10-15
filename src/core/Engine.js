// Motor: renderizador, cena, câmera isométrica com giro e zoom, pós-processamento (bloom) e o laço de quadros.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export class Engine {
  constructor(container) {
    this.container = container;
    this.updaters = new Set();
    this.clock = new THREE.Clock();
    this.elapsed = 0;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);

    // Rótulos em HTML presos a objetos 3D (barras de vida, números de dano).
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels';
    container.appendChild(this.labels.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#05070e');
    scene.fog = new THREE.FogExp2('#070a16', 0.03);

    // Um ambiente suave só para os metais (ouro, fivelas) terem o que refletir.
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.22;

    // Câmera "isométrica": perspectiva de lente longa vista de cima, em 45°.
    const cam = (this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200));
    this.target = new THREE.Vector3(0, 0.6, 0);
    this.view = { azimuth: Math.PI / 4, polar: 0.98, distance: 14.5 };
    this.placeCamera();

    const c = (this.controls = new OrbitControls(cam, this.labels.domElement));
    c.target.copy(this.target);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.enablePan = false;
    c.minDistance = 2.2;
    c.maxDistance = 28;
    c.minPolarAngle = 0.45;
    c.maxPolarAngle = 1.32;
    // O botão esquerdo fica livre para o jogo (selecionar e mover o mago). Girar: botão direito; zoom: roda.
    c.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    c.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
    c.update();

    // Pós-processamento: o brilho (bloom) pega só o que passa do branco (olhos, cristais, runas).
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.45, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.turn = null; // giro animado da câmera (teclas Q e E)
    this.shakeState = { amp: 0, decay: 1, t: 0, offset: new THREE.Vector3() }; // tremor de câmera (magias de terra, explosões)
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  placeCamera() {
    const { azimuth, polar, distance } = this.view;
    const s = Math.sin(polar);
    this.camera.position.set(
      this.target.x + distance * s * Math.sin(azimuth),
      this.target.y + distance * Math.cos(polar),
      this.target.z + distance * s * Math.cos(azimuth),
    );
    this.camera.lookAt(this.target);
  }

  // Gira a câmera em volta do alvo, suave, por 'delta' radianos.
  rotateBy(delta) {
    const off = this.camera.position.clone().sub(this.controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    this.turn = { from: sph.theta, to: (this.turn ? this.turn.to : sph.theta) + delta, start: performance.now() };
  }

  zoomBy(factor) {
    const off = this.camera.position.clone().sub(this.controls.target);
    const d = THREE.MathUtils.clamp(off.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(off.setLength(d));
  }

  resetView() {
    this.turn = null;
    this.controls.target.copy(this.target);
    this.placeCamera();
  }

  focusOn(point, distance) {
    this.controls.target.copy(point);
    const off = this.camera.position.clone().sub(point).setLength(distance);
    this.camera.position.copy(point).add(off);
  }

  onUpdate(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }

  // Tremor de câmera: 'strength' em metros, some em 'duration' segundos. Só mexe na hora de desenhar:
  // a câmera volta ao lugar logo depois, então os controles e o giro não percebem.
  shake(strength = 0.05, duration = 0.4) {
    const s = this.shakeState;
    if (strength >= s.amp) { s.amp = strength; s.decay = strength / Math.max(0.05, duration); }
  }

  shakeOffset(dt) {
    const s = this.shakeState;
    s.offset.set(0, 0, 0);
    if (s.amp <= 0) return s.offset;
    s.t += dt;
    const a = s.amp;
    s.offset.set(Math.sin(s.t * 71) * a, Math.sin(s.t * 89 + 1.7) * a * 0.7, Math.sin(s.t * 63 + 3.1) * a);
    s.amp = Math.max(0, s.amp - s.decay * dt);
    return s.offset;
  }

  // Avança a lógica do jogo sem desenhar. Usado pelos testes automáticos, que rodam sem placa de vídeo.
  simulate(seconds, step = 1 / 60) {
    for (let t = 0; t < seconds - 1e-9; t += step) {
      this.elapsed += step;
      for (const fn of this.updaters) fn(step, this.elapsed);
    }
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.labels.setSize(w, h);
  }

  start() {
    const loop = () => {
      this.realDt = this.clock.getDelta(); // tempo real entre quadros (a qualidade automática usa)
      const dt = Math.min(0.05, this.realDt);
      this.elapsed += dt;
      if (this.turn) {
        this.turn.t = Math.min(1, (performance.now() - this.turn.start) / 450); // pelo relógio, não pelos quadros
        const e = 1 - (1 - this.turn.t) ** 3;
        const off = this.camera.position.clone().sub(this.controls.target);
        const sph = new THREE.Spherical().setFromVector3(off);
        sph.theta = this.turn.from + (this.turn.to - this.turn.from) * e;
        this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(sph));
        if (this.turn.t >= 1) this.turn = null;
      }
      this.controls.update();
      for (const fn of this.updaters) fn(dt, this.elapsed);
      const shake = this.shakeOffset(dt);
      this.camera.position.add(shake);
      this.composer.render();
      this.labels.render(this.scene, this.camera);
      this.camera.position.sub(shake);
      this.frames = (this.frames || 0) + 1;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
