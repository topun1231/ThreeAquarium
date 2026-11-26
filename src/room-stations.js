const rackStart=1.79, bayWidth=1.38, lower=-.91;

export const roomStations={
 main:{place:'窗边木柜',x:0,y:0},
 breeding:{place:'繁育架上层左侧',x:rackStart+bayWidth/2,y:0},
 'breeding-2':{place:'繁育架上层右侧',x:rackStart+bayWidth*1.5,y:0},
 'breeding-3':{place:'繁育架下层左侧',x:rackStart+bayWidth/2,y:lower},
};

export const breedingRack={start:rackStart,width:bayWidth*2,lower,depth:.86};
