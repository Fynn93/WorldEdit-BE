import { BlockLocation } from "mojang-minecraft";
import { PlayerSession } from "../sessions.js";
import { Brush } from "./base_brush.js";
import { SphereShape } from "../shapes/sphere.js";
import { Mask } from "@modules/mask.js";
import { Pattern } from "@modules/pattern.js";

/**
 * This brush creates sphere shaped patterns in the world.
 */
export class SphereBrush extends Brush {
  private shape: SphereShape;
  private pattern: Pattern;
  private hollow: boolean;

  /**
    * @param radius The radius of the spheres
    * @param pattern The pattern the spheres will be made of
    * @param hollow Whether the spheres will be made hollow
    */
  constructor(radius: number, pattern: Pattern, hollow: boolean) {
    super();
    this.assertSizeInRange(radius);
    this.shape = new SphereShape(radius);
    this.shape.usedInBrush = true;
    this.pattern = pattern;
    this.hollow = hollow;
  }

  public resize(value: number) {
    this.assertSizeInRange(value);
    this.shape = new SphereShape(value);
    this.shape.usedInBrush = true;
  }

  public paintWith(value: Pattern) {
    this.pattern = value;
  }

  public *apply(loc: BlockLocation, session: PlayerSession, mask?: Mask) {
    yield* this.shape.generate(loc, this.pattern, mask, session, {"hollow": this.hollow});
  }
}