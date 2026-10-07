import { Box3, MathUtils, PerspectiveCamera, Vector3 } from "three";

export type WalkDirection = "forward" | "back" | "left" | "right";
const keys: Record<string, WalkDirection | "turnLeft" | "turnRight" | "lookUp" | "lookDown"> = {
  KeyW: "forward", ArrowUp: "forward", KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
  KeyQ: "turnLeft", KeyE: "turnRight", KeyR: "lookUp", KeyF: "lookDown",
};
const pitchLimit = MathUtils.degToRad(80);

// Camera-only navigation of the prepared model: fixed eye height, no wall collisions.
export class WalkthroughControls {
  private pressed = new Set<string>();
  private held = new Set<WalkDirection>();

  constructor(private camera: PerspectiveCamera, private bounds: Box3, private start: Vector3, private startYaw = 0) {
    camera.rotation.order = "YXZ";
    this.reset();
  }

  reset() {
    this.stop();
    this.camera.position.copy(this.start);
    this.camera.rotation.set(0, this.startYaw, 0, "YXZ");
    this.move(0, 0, 0);
  }

  look(yaw: number, pitch: number) {
    this.camera.rotation.y += yaw;
    this.camera.rotation.x = MathUtils.clamp(this.camera.rotation.x + pitch, -pitchLimit, pitchLimit);
  }

  face(point: Vector3) {
    this.camera.lookAt(point);
    this.look(0, 0);
  }

  key(code: string, down: boolean) {
    if (!Object.hasOwn(keys, code)) return false;
    if (down) this.pressed.add(code); else this.pressed.delete(code);
    return true;
  }

  hold(direction: WalkDirection, down: boolean) {
    if (down) this.held.add(direction); else this.held.delete(direction);
  }

  stop() { this.pressed.clear(); this.held.clear(); }

  step(seconds: number) {
    const active = new Set([...this.pressed].map(code => keys[code]));
    for (const direction of this.held) active.add(direction);
    const axis = (positive: typeof keys[string], negative: typeof keys[string]) => Number(active.has(positive)) - Number(active.has(negative));
    const delta = MathUtils.clamp(seconds, 0, .05);
    this.look(axis("turnLeft", "turnRight") * 1.4 * delta, axis("lookUp", "lookDown") * 1.4 * delta);
    this.move(axis("forward", "back"), axis("right", "left"), 6 * delta);
  }

  walk(direction: WalkDirection) {
    this.move(direction === "forward" ? 1 : direction === "back" ? -1 : 0, direction === "right" ? 1 : direction === "left" ? -1 : 0, 1.5);
  }

  private move(forward: number, right: number, distance: number) {
    const scale = distance / Math.max(1, Math.hypot(forward, right));
    const yaw = this.camera.rotation.y, position = this.camera.position;
    position.x = MathUtils.clamp(position.x + (-Math.sin(yaw) * forward + Math.cos(yaw) * right) * scale, this.bounds.min.x, this.bounds.max.x);
    position.z = MathUtils.clamp(position.z + (-Math.cos(yaw) * forward - Math.sin(yaw) * right) * scale, this.bounds.min.z, this.bounds.max.z);
    position.y = this.start.y;
  }
}
