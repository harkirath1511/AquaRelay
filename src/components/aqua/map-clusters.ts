export function clusterPoints(points: { id:string; x:number; y:number }[], radius=60) {
  const cells=new Map<string,{ids:string[];x:number;y:number}>();
  for(const point of points){
    const key=`${Math.floor(point.x/radius)}:${Math.floor(point.y/radius)}`;
    const cell=cells.get(key);
    if(cell)cell.ids.push(point.id);else cells.set(key,{ids:[point.id],x:point.x,y:point.y});
  }
  return [...cells.values()];
}
