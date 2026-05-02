import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

export function createOrbit(cam: THREE.Camera, dom: HTMLElement): TrackballControls {
  const controls = new TrackballControls(cam, dom);
  controls.rotateSpeed = 2.0;
  controls.zoomSpeed = 0.6;
  controls.panSpeed = 0.8;
  controls.noPan = true;
  controls.noZoom = false;
  controls.dynamicDampingFactor = 0.12;
  controls.minDistance = 5;
  controls.maxDistance = 18;

  return controls;
}
