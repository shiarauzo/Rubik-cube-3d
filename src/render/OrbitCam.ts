import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createOrbit(cam: THREE.Camera, dom: HTMLElement): OrbitControls {
  const controls = new OrbitControls(cam, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.enablePan = false;
  controls.zoomSpeed = 0.6;
  controls.rotateSpeed = 0.8;
  controls.minDistance = 5;
  controls.maxDistance = 18;
  return controls;
}
