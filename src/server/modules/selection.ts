import { regionBounds, regionVolume, Server, Vector } from "@notbeer-api";
import { BlockLocation, Player } from "mojang-minecraft";
import { SphereShape } from "../shapes/sphere.js";
import { Shape } from "../shapes/base_shape.js";
import { CuboidShape } from "../shapes/cuboid.js";
import { getWorldMaxY, getWorldMinY } from "../util.js";
import { DRAW_SELECTION } from "@config.js";

// TODO: Add other selection modes

export const selectModes = ["cuboid", "extend", "sphere"] as const;
export type selectMode = typeof selectModes[number];

export class Selection {
  private _mode: selectMode = "cuboid";
  private _points: BlockLocation[] = [];
  private _visible: boolean = DRAW_SELECTION;

  private player: Player;
  private drawPoints: Vector[] = [];
  private drawTimer = 0;

  constructor(player: Player) {
    this.player = player;
  }

  /**
    * Sets either the first or second selection point of a selection.
    * @param index The first or second selection point
    * @param loc The location the selection point is being made
    */
  public set(index: 0|1, loc: BlockLocation): void {
    if (index > 0 && this._points.length == 0 && this._mode != "cuboid") {
      throw "worldedit.selection.noPrimary";
    }
    if (this._points.length <= index) {
      this._points.length = index + 1;
    }

    if (index == 0 && this._mode != "cuboid") {
      this._points = [loc, loc.offset(0, 0, 0)];
    } else if (this._mode == "cuboid") {
      this._points[index] = loc;
      if (this._mode != "cuboid") {
        this._points.length = 1;
      }
    } else if (this._mode == "extend") {
      this._points[0] = Vector.min(this._points[0], this._points[1]).min(loc).toBlock();
      this._points[1] = Vector.max(this._points[0], this._points[1]).max(loc).toBlock();
    } else if (this._mode == "sphere") {
      const vec = Vector.sub(new BlockLocation(loc.x, loc.y, loc.z), this._points[0]);
      const radius = Math.round(vec.length);
      this._points[1] = vec.normalized().mul(radius).add(this._points[0]).toBlock();
    }


    const [min, max] = [getWorldMinY(this.player), getWorldMaxY(this.player)];
    this._points.forEach(p => p.y = Math.min(Math.max(p.y, min), max));
    this.updateDrawSelection();
  }

  /**
    * Clears the selection points that have been made.
    */
  public clear() {
    this._points = [];
    this.updateDrawSelection();
  }

  /**
     * Get the shape of the current selection
     * @returns
     */
  public getShape(): [Shape, BlockLocation] {
    if (!this.isValid()) return null;

    if (this.isCuboid()) {
      const [start, end] = regionBounds(this._points);
      const size = Vector.sub(end, start).add(1);
      return [new CuboidShape(size.x, size.y, size.z), start];
    } else if (this._mode == "sphere") {
      const center = this._points[0];
      const radius = Vector.sub(this._points[1], this._points[0]).length;
      return [new SphereShape(radius), center];
    }
  }

  /**
    * @return The blocks within the current selection
    */
  public* getBlocks() {
    if (!this.isValid()) return;

    const [shape, loc] = this.getShape();
    yield* shape.getBlocks(loc);
  }

  /**
     * Returns the exact or approximate number of blocks the selection encompasses.
     * @returns
     */
  public getBlockCount() {
    if (!this.isValid()) return 0;

    if (this.isCuboid()) {
      return regionVolume(this._points[0], this._points[1]);
    } else if (this._mode == "sphere") {
      const radius = Vector.sub(this._points[1], this._points[0]).length;
      return Math.round((4/3) * Math.PI * Math.pow(radius, 3));
    }
  }

  /**
    * @return The minimum and maximum points of the selection
    */
  public getRange(): [BlockLocation, BlockLocation] {
    const [shape, loc] = this.getShape();
    if (shape) {
      return shape.getRegion(loc);
    }
    return null;
  }

  public isCuboid(): boolean {
    return this._mode == "cuboid" || this._mode == "extend";
  }

  public isValid() {
    let points = 0;
    for (const point of this._points) {
      if (point) points++;
    }
    return points != 0 && points != 1;
  }

  public draw(): void {
    if (!this._visible) return;
    if (this.drawTimer <= 0) {
      this.drawTimer = 10;
      const dimension = this.player.dimension;
      for (const point of this.drawPoints) {
        Server.runCommand(`particle wedit:selection_draw ${point.print()}`, dimension);
      }
    }
    this.drawTimer--;
  }

  public get mode(): selectMode {
    return this._mode;
  }

  public set mode(value: selectMode) {
    const wasCuboid = this.isCuboid();
    this._mode = value;

    if (!this.isCuboid || wasCuboid != this.isCuboid()) {
      this.clear();
    }
    this.updateDrawSelection();
  }

  public get points() {
    return this._points.slice();
  }

  public get visible(): boolean {
    return this._visible;
  }

  public set visible(value: boolean) {
    this._visible = value;
  }

  private updateDrawSelection() {
    this.drawPoints.length = 0;
    if (!this.isValid()) return;

    if (this.isCuboid()) {
      const min = Vector.min(this._points[0], this._points[1]).add(Vector.ZERO);
      const max = Vector.max(this._points[0], this._points[1]).add(Vector.ONE);

      const corners = [
        new Vector(min.x, min.y, min.z),
        new Vector(max.x, min.y, min.z),
        new Vector(min.x, max.y, min.z),
        new Vector(max.x, max.y, min.z),
        new Vector(min.x, min.y, max.z),
        new Vector(max.x, min.y, max.z),
        new Vector(min.x, max.y, max.z),
        new Vector(max.x, max.y, max.z)
      ];

      const edgeData: [number, number][]= [
        [0, 1], [2, 3], [4, 5], [6, 7],
        [0, 2], [1, 3], [4, 6], [5, 7],
        [0, 4], [1, 5], [2, 6], [3, 7]
      ];
      const edgePoints: Vector[] = [];
      for (const edge of edgeData) {
        const [a, b] = [corners[edge[0]], corners[edge[1]]];
        const pointCount = Math.min(Math.floor(b.sub(a).length), 16);
        for (let i = 1; i < pointCount; i++) {
          const t = i / pointCount;
          edgePoints.push(a.lerp(b, t));
        }
      }
      this.drawPoints = corners.concat(edgePoints);
    } else if (this._mode == "sphere") {
      const axes: [typeof Vector.prototype.rotateX, Vector][] = [
        [Vector.prototype.rotateX, new Vector(0, 1, 0)],
        [Vector.prototype.rotateY, new Vector(1, 0, 0)],
        [Vector.prototype.rotateZ, new Vector(0, 1, 0)]
      ];
      const loc = this._points[0];
      const radius = Vector.sub(this._points[1], loc).length + 0.5;
      const resolution = Math.min(radius * 2*Math.PI, 72);

      for (const [rotateBy, vec] of axes) {
        for (let i = 0; i < 1; i += 1 / resolution) {
          let point: Vector = rotateBy.call(vec, i * 360);
          point = point.mul(radius).add(loc).add(0.5);
          this.drawPoints.push(point);
        }
      }
    }

    // A slight offset is made since exact integers snap the particles to the center of blocks.
    for (const point of this.drawPoints) {
      point.x += 0.001;
      point.z += 0.001;
    }
    this.drawTimer = 0;
  }
}