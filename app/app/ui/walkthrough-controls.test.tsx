import assert from "node:assert/strict";
import test from "node:test";
import { Box3, MathUtils, PerspectiveCamera, Vector3 } from "three";
import { WalkthroughControls } from "./walkthrough-controls";

// From app/: node -e "require.extensions['.tsx']=(m,f)=>m._compile(require('typescript').transpileModule(require('fs').readFileSync(f,'utf8'),{compilerOptions:{module:1,target:7,esModuleInterop:true}}).outputText,f);require('./app/ui/walkthrough-controls.test.tsx')"
function setup() {
  const camera = new PerspectiveCamera();
  const bounds = new Box3(new Vector3(-20, 0, -20), new Vector3(20, 10, 20));
  const start = new Vector3(0, 5.25, 0);
  return { camera, start, bounds, controls: new WalkthroughControls(camera, bounds, start) };
}
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("looking and focusing turn in place without changing eye height or adding roll", () => {
  const { camera, controls, start } = setup();
  controls.look(.9, .4);
  assert.deepEqual(camera.position, start);
  controls.face(new Vector3(15, 50, 8));
  assert.deepEqual(camera.position, start);
  near(camera.rotation.z, 0);
  controls.look(0, 100);
  near(camera.rotation.x, MathUtils.degToRad(80));
  controls.look(0, -200);
  near(camera.rotation.x, -MathUtils.degToRad(80));
});

test("diagonal, duplicate keys and simultaneous touch never multiply walking speed", () => {
  for (const codes of [["KeyW"], ["KeyW", "ArrowUp"], ["KeyW", "KeyD"], ["KeyW", "KeyD", "ArrowUp", "ArrowRight"]]) {
    const { camera, controls, start } = setup();
    codes.forEach(code => controls.key(code, true));
    controls.hold("forward", true);
    for (let i = 0; i < 20; i++) controls.step(.05);
    near(camera.position.distanceTo(start), 6);
  }
});

test("movement follows heading and stays horizontal even while looking up", () => {
  const { camera, controls, start } = setup();
  controls.look(Math.PI / 2, 1);
  controls.walk("forward");
  near(camera.position.x, -1.5); near(camera.position.z, 0); near(camera.position.y, start.y);
  controls.walk("right");
  near(camera.position.z, -1.5);
});

test("the Level 02 tour keeps its 19.25 ft eye height through movement, focus and reset", () => {
  const camera = new PerspectiveCamera();
  const start = new Vector3(0, 19.25, 0);
  const controls = new WalkthroughControls(camera, new Box3(new Vector3(-20, 0, -20), new Vector3(20, 28, 20)), start, Math.PI / 2);
  controls.walk("forward"); controls.face(new Vector3(10, 14, 10));
  controls.key("KeyW", true); controls.step(.05);
  near(camera.position.y, 19.25);
  controls.reset(); assert.deepEqual(camera.position, start); near(camera.rotation.y, Math.PI / 2);
});

test("held input, key releases, opposite directions and stop have predictable behavior", () => {
  const { camera, controls } = setup();
  controls.key("KeyW", true); controls.key("KeyS", true); controls.step(.05);
  near(camera.position.z, 0);
  controls.key("KeyS", false); controls.step(.05);
  near(camera.position.z, -.3);
  controls.hold("right", true); controls.stop();
  const stopped = camera.position.clone(); controls.step(.05);
  assert.deepEqual(camera.position, stopped);
  assert.equal(controls.key("Tab", true), false);
});

test("keyboard look, reset and long frame gaps remain bounded", () => {
  const { camera, controls, start, bounds } = setup();
  controls.key("KeyQ", true); controls.key("KeyR", true); controls.step(.05);
  near(camera.rotation.y, .07); near(camera.rotation.x, .07);
  controls.reset(); assert.deepEqual(camera.position, start); near(camera.rotation.y, 0); near(camera.rotation.x, 0);
  controls.step(.05); assert.deepEqual(camera.position, start);
  controls.key("KeyW", true); controls.step(30);
  near(camera.position.distanceTo(start), .3);
  for (let i = 0; i < 300; i++) controls.step(.05);
  near(camera.position.z, bounds.min.z);
  camera.position.set(200, 50, -200); controls.step(0);
  near(camera.position.x, bounds.max.x); near(camera.position.z, bounds.min.z); near(camera.position.y, start.y);
});
