import { expect,it } from "vitest";
import { clusterPoints } from "./map-clusters";
it("keeps collocated public records selectable without dropping IDs",()=>{expect(clusterPoints([{id:"a",x:10,y:10},{id:"b",x:10,y:10},{id:"c",x:500,y:500}]).map(c=>c.ids)).toEqual([["a","b"],["c"]]);});
it("separates distant points and handles an empty live response",()=>{expect(clusterPoints([])).toEqual([]);expect(clusterPoints([{id:"a",x:1,y:1},{id:"b",x:300,y:300}])).toHaveLength(2);});
