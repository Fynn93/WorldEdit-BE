import { assertCuboidSelection, assertCanBuildWithin } from "@modules/assert.js";
import { Cardinal } from "@modules/directions.js";
import { Jobs } from "@modules/jobs.js";
import { RawText, regionBounds, regionSize, regionVolume } from "@notbeer-api";
import { BlockLocation } from "mojang-minecraft";
import { registerCommand } from "../register_commands.js";

const registerInformation = {
  name: "stack",
  permission: "worldedit.region.stack",
  description: "commands.wedit:stack.description",
  usage: [
    {
      name: "count",
      type: "int",
      range: [1, null] as [number, null],
      default: 1
    }, {
      name: "offset",
      type: "Direction",
      default: new Cardinal()
    }
  ]
};

registerCommand(registerInformation, function* (session, builder, args) {
  assertCuboidSelection(session);
  const amount = args.get("count");
  const [start, end] = session.selection.getRange();
  const dim = builder.dimension;
  const size = regionSize(start, end);

  const dir = args.get("offset").getDirection(builder).mul(size);
  let loadStart = start.offset(dir.x, dir.y, dir.z);
  let loadEnd = end.offset(dir.x, dir.y, dir.z);
  let count = 0;

  const loads: [BlockLocation, BlockLocation][] = [];
  const points: BlockLocation[] = [];
  for (let i = 0; i < amount; i++) {
    loads.push([loadStart, loadEnd]);
    points.push(loadStart, loadEnd);
    loadStart = loadStart.offset(dir.x, dir.y, dir.z);
    loadEnd = loadEnd.offset(dir.x, dir.y, dir.z);
  }
  const stackRegion = regionBounds(points);
  assertCanBuildWithin(builder, stackRegion[0], stackRegion[1]);

  const history = session.getHistory();
  const record = history.record();
  const tempStack = session.createRegion(false);
  const job = Jobs.startJob(session, loads.length + 1, stackRegion);
  try {
    Jobs.nextStep(job, "Copying blocks...");
    yield* Jobs.perform(job, tempStack.saveProgressive(start, end, dim), false);
    for (const load of loads) {
      Jobs.nextStep(job, "Pasting blocks...");
      history.addUndoStructure(record, load[0], load[1], "any");
      yield* Jobs.perform(job, tempStack.loadProgressive(load[0], dim), false);
      history.addRedoStructure(record, load[0], load[1], "any");
      count += regionVolume(load[0], load[1]);
    }
    history.commit(record);
  } catch (e) {
    history.cancel(record);
    throw e;
  } finally {
    session.deleteRegion(tempStack);
    Jobs.finishJob(job);
  }

  return RawText.translate("commands.wedit:stack.explain").with(count);
});
