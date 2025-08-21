// assets/app.js
(() => {
  const GLB_PATH = './assets/garment.glb';

  // ------- three.js 基本セットアップ -------
  const canvas = document.querySelector('#c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  if (renderer.outputColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x141414);
  const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 100); camera.position.set(0, 1.6, 3.2);
  const controls = new THREE.OrbitControls(camera, renderer.domElement); controls.enableDamping = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x223, 1.0));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0); dir.position.set(2, 2, 4); scene.add(dir);

  // 収集したマテリアルのグループ
  const groups = { ALL: [], A: [], B: [], C: [] };
  let model;

  // ------- glb 読み込み -------
  const loader = new THREE.GLTFLoader();
  loader.load(
    GLB_PATH,
    (glb) => {
      model = glb.scene; scene.add(model);
      analyze(model); fit(model);
      msg('garment.glb を読み込みました');
    },
    undefined,
    () => {
      // 失敗時はキューブ
      const g = new THREE.BoxGeometry(1, 1.2, 0.5);
      const m = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.1, roughness: 0.7 });
      const cube = new THREE.Mesh(g, m);
      scene.add(cube);
      groups.ALL = [cube.material];
      updateMatInfo();
      msg('assets/garment.glb が無いのでキューブ表示');
    }
  );

  const ensureStd = (m) => m && m.isMeshStandardMaterial;

  // マテリアル抽出＆仕分け
  function analyze(root) {
    const set = new Set();
    root.traverse(o => {
      if (o.isMesh) {
        if (Array.isArray(o.material)) o.material.forEach(m => set.add(m));
        else set.add(o.material);
      }
    });
    const all = Array.from(set).filter(ensureStd);
    groups.ALL = all;

    const toL = (s) => (s || '').toLowerCase();
    groups.A = all.filter(m => toL(m.name).startsWith('fabric_a'));
    groups.B = all.filter(m => toL(m.name).startsWith('fabric_b'));
    groups.C = all.filter(m => toL(m.name).startsWith('fabric_c'));

    // デバッグ: F12 コンソールで一覧確認
    try { console.table(all.map(m => ({ name: m.name, type: m.type }))); } catch {}

    updateMatInfo();
  }

  function updateMatInfo() {
    const el = document.getElementById('matinfo');
    if (el) el.textContent =
      `適用対象: ${groups.ALL.length} material(s)  |  A:${groups.A.length} / B:${groups.B.length} / C:${groups.C.length}`;
  }

  function fit(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    controls.target.copy(center);
    const dist = size * 0.6 / Math.tan((Math.PI * camera.fov) / 360);
    camera.position.copy(center.clone().add(new THREE.Vector3(0, size * 0.1, dist)));
    camera.near = size / 100;
    camera.far = size * 10;
    camera.updateProjectionMatrix();
    controls.update();
  }

  // ------- テクスチャ適用 -------
  const texLoader = new THREE.TextureLoader();

  function loadTexture(fileOrUrl, done) {
    const url = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
    const t = texLoader.load(url, () => {
      if (t.colorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      done(t);
      tile(); // 現在の倍率・回転を反映
    });
  }

  function setMapFor(materials, tex) {
    materials.forEach(m => {
      if (!ensureStd(m)) return;
      m.map = tex;
      m.needsUpdate = true;
      if (typeof m.metalness === 'number') m.metalness = Math.min(m.metalness, 0.15);
      if (typeof m.roughness === 'number') m.roughness = Math.max(m.roughness, 0.6);
    });
  }

  function applyAll(file) { loadTexture(file, tex => setMapFor(groups.ALL, tex)); }
  function applyGroup(file, key) {
    const mats = groups[key] || [];
    if (!mats.length) { msg(`"${key}" グループなし。CLO の material.name を "fabric_${key.toLowerCase()}..." にしてね`); return; }
    loadTexture(file, tex => setMapFor(mats, tex));
  }

  // ------- UI -------
  const rep = document.getElementById('repeat');
  const rot = document.getElementById('rot');
  const repv = document.getElementById('repv');
  const rotv = document.getElementById('rotv');

  function tile() {
    if (repv) repv.textContent = rep.value;
    if (rotv) rotv.textContent = rot.value;
    const allMats = new Set([...groups.ALL, ...groups.A, ...groups.B, ...groups.C]);
    allMats.forEach(m => {
      if (m && m.map) {
        m.map.repeat.set(parseFloat(rep.value), parseFloat(rep.value));
        m.map.rotation = parseFloat(rot.value) * Math.PI / 180;
        m.map.center.set(0.5, 0.5);
        m.map.needsUpdate = true;
      }
    });
  }

  document.getElementById('file')?.addEventListener('change', e => {
    const f = e.target.files?.[0]; if (!f) return; applyAll(f); msg('全体に適用しました');
  });
  document.getElementById('fileA')?.addEventListener('change', e => {
    const f = e.target.files?.[0]; if (!f) return; applyGroup(f, 'A'); msg('A に適用しました');
  });
  document.getElementById('fileB')?.addEventListener('change', e => {
    const f = e.target.files?.[0]; if (!f) return; applyGroup(f, 'B'); msg('B に適用しました');
  });
  document.getElementById('fileC')?.addEventListener('change', e => {
    const f = e.target.files?.[0]; if (!f) return; applyGroup(f, 'C'); msg('C に適用しました');
  });

  rep?.addEventListener('input', tile);
  rot?.addEventListener('input', tile);

  document.getElementById('resetCam')?.addEventListener('click', () => {
    if (model) fit(model);
    else { camera.position.set(0, 1.2, 3); controls.target.set(0, 0, 0); controls.update(); }
  });

  // ------- ループ -------
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
  }
  function loop() { resize(); controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); }
  loop();

  // メッセージ
  let t; function msg(s) {
    const el = document.getElementById('msg'); if (!el) return;
    el.textContent = s; el.hidden = false; clearTimeout(t); t = setTimeout(() => el.hidden = true, 2200);
  }
})();
